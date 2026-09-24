-- Paystack deposit ledger + idempotent crediting.
--
-- NOT APPLIED YET. This migration is staged for review: it must be applied
-- (supabase db push, with explicit approval) before /api/payments/* can move
-- real money. It creates no behavior on its own.
--
-- Design:
-- - payment_references is the idempotency ledger. One row per Paystack
--   reference, written as "pending" before the charge starts and flipped to
--   "credited"/"failed" exactly once.
-- - credit_paystack_deposit is a SECURITY DEFINER function. It locks the
--   reference row (SELECT ... FOR UPDATE), validates that the caller-supplied
--   user/currency/amount exactly match the stored pending row, then flips the
--   row to "credited" and moves money in the same transaction. Concurrent
--   webhook + client-poll callers serialize on the row lock: the first flips
--   pending -> credited, the second sees "credited" and returns already=true
--   without moving money.
-- - A "failed" reference can never be credited by this function: a failed
--   charge needs an explicit, reviewed transition, never an automatic one.

CREATE TABLE IF NOT EXISTS public.payment_references (
  reference TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack',
  kind TEXT NOT NULL DEFAULT 'deposit',
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed')),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at TIMESTAMPTZ
);

ALTER TABLE public.payment_references ENABLE ROW LEVEL SECURITY;

-- Explicit Data API grants (Supabase stops auto-granting after Oct 30, 2026).
GRANT SELECT ON public.payment_references TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_references TO service_role;
REVOKE ALL ON public.payment_references FROM anon;

-- Users may read their own references; all writes go through the server.
DROP POLICY IF EXISTS "Users see own payment references" ON public.payment_references;
CREATE POLICY "Users see own payment references"
  ON public.payment_references FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS payment_references_user_id_idx
  ON public.payment_references (user_id);

-- Idempotent deposit credit. Safe to call twice for the same reference:
-- the second call returns { ok: true, already: true } without moving money.
--
-- Raises (and moves no money) when:
-- - the reference is unknown (never initiated by /api/payments/deposit),
-- - the stored user_id / currency / amount_cents do not exactly match,
-- - the reference already failed.
CREATE OR REPLACE FUNCTION public.credit_paystack_deposit(
  _user_id uuid,
  _reference text,
  _amount_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.payment_references%ROWTYPE;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Lock the reference row. Concurrent callers (webhook + client poll)
  -- serialize here: exactly one of them sees status = 'pending'.
  SELECT * INTO _row
    FROM public.payment_references
   WHERE reference = _reference
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown payment reference';
  END IF;

  IF _row.kind <> 'deposit' THEN
    RAISE EXCEPTION 'reference is not a deposit';
  END IF;

  IF _row.user_id <> _user_id THEN
    RAISE EXCEPTION 'payment reference belongs to a different user';
  END IF;

  IF _row.currency <> 'KES' THEN
    RAISE EXCEPTION 'payment currency mismatch';
  END IF;

  IF _row.amount_cents <> _amount_cents THEN
    RAISE EXCEPTION 'payment amount mismatch';
  END IF;

  IF _row.status = 'credited' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _row.status = 'failed' THEN
    RAISE EXCEPTION 'payment reference already failed';
  END IF;

  -- _row.status = 'pending': flip first, then move money, in one transaction.
  UPDATE public.payment_references
     SET status = 'credited',
         credited_at = now()
   WHERE reference = _reference;

  UPDATE public.profiles
     SET kes_balance = kes_balance + _amount_cents,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_user_id, 'deposit', _amount_cents, 'Paystack M-Pesa deposit ' || _reference);

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_paystack_deposit(uuid, text, bigint) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.credit_paystack_deposit(uuid, text, bigint) TO service_role;
