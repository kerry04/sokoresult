-- ============================================================
-- 1. KYC enforcement on trade RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(_market_id uuid, _outcome text, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _q numeric[];
  _i int;
  _delta numeric;
  _cost numeric;
  _cost_cents bigint;
  _avg_price numeric;
  _balance bigint;
  _pos RECORD;
  _new_yes numeric;
  _new_no numeric;
  _new_shares int;
  _new_avg numeric;
  _trade_id uuid;
  _q_before numeric[];
  _max_shares int;
  _tier smallint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier INTO _tier FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN
    RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade';
  END IF;

  PERFORM public.check_rate_limit('execute_lmsr_trade_binary', 30, 300);

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.market_type <> 'binary' THEN RAISE EXCEPTION 'Not a binary market'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  _q_before := ARRAY[_m.q_yes, _m.q_no]::numeric[];
  _q := _q_before;
  _i := CASE WHEN _outcome = 'YES' THEN 1 ELSE 2 END;
  _delta := CASE WHEN _side = 'BUY' THEN _quantity ELSE -_quantity END;

  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _cost_cents := round(abs(_cost) * 100)::bigint;
  _avg_price := abs(_cost) / _quantity;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per outcome (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
    END IF;
  END IF;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now() WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, shares, avg_price)
      VALUES (_uid, _market_id, _outcome, _quantity, _avg_price);
    ELSE
      _new_shares := _pos.shares + _quantity;
      _new_avg := ((_pos.shares * _pos.avg_price) + (_quantity * _avg_price)) / NULLIF(_new_shares, 0);
      UPDATE public.positions SET shares = _new_shares, avg_price = _new_avg, updated_at = now() WHERE id = _pos.id;
    END IF;
  ELSE
    IF _pos.id IS NULL OR _pos.shares < _quantity THEN
      RAISE EXCEPTION 'Insufficient shares to sell';
    END IF;
    UPDATE public.profiles SET kes_balance = kes_balance + _cost_cents, updated_at = now() WHERE id = _uid;
    UPDATE public.positions SET shares = _pos.shares - _quantity, updated_at = now() WHERE id = _pos.id;
  END IF;

  _q[_i] := _q[_i] + _delta;
  _new_yes := public.lmsr_price(_q, _m.liquidity_b, 1);
  _new_no  := 1 - _new_yes;

  INSERT INTO public.trades (user_id, market_id, outcome, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, _outcome, _side, _quantity, _avg_price, _cost_cents)
  RETURNING id INTO _trade_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

  UPDATE public.markets
    SET q_yes = _q[1], q_no = _q[2],
        yes_price = _new_yes, no_price = _new_no,
        volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _new_yes);
  INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents, trade_id)
    VALUES (_market_id, _q_before, _q, _m.liquidity_b,
            CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END, _trade_id);

  RETURN jsonb_build_object(
    'ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
    'new_yes_price', _new_yes, 'trade_id', _trade_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(_market_id uuid, _outcome_id uuid, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _outcome RECORD;
  _q numeric[];
  _ids uuid[];
  _i int;
  _delta numeric;
  _cost numeric;
  _cost_cents bigint;
  _avg_price numeric;
  _balance bigint;
  _pos RECORD;
  _new_shares int;
  _new_avg numeric;
  _trade_id uuid;
  _q_before numeric[];
  _new_price numeric;
  _idx int;
  _row_id uuid;
  _max_shares int;
  _tier smallint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier INTO _tier FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN
    RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade';
  END IF;

  PERFORM public.check_rate_limit('execute_lmsr_trade_multi', 30, 300);

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.market_type <> 'multi' THEN RAISE EXCEPTION 'Not a multi-outcome market'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  PERFORM 1 FROM public.market_outcomes WHERE market_id = _market_id FOR UPDATE;

  SELECT array_agg(q ORDER BY sort_order, created_at),
         array_agg(id ORDER BY sort_order, created_at)
    INTO _q, _ids
    FROM public.market_outcomes WHERE market_id = _market_id;

  _i := array_position(_ids, _outcome_id);
  IF _i IS NULL THEN RAISE EXCEPTION 'Outcome not in market'; END IF;
  SELECT * INTO _outcome FROM public.market_outcomes WHERE id = _outcome_id;

  _q_before := _q;
  _delta := CASE WHEN _side = 'BUY' THEN _quantity ELSE -_quantity END;
  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _cost_cents := round(abs(_cost) * 100)::bigint;
  _avg_price := abs(_cost) / _quantity;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome_id = _outcome_id FOR UPDATE;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per candidate (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
    END IF;
  END IF;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now() WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, outcome_id, shares, avg_price)
      VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _quantity, _avg_price);
    ELSE
      _new_shares := _pos.shares + _quantity;
      _new_avg := ((_pos.shares * _pos.avg_price) + (_quantity * _avg_price)) / NULLIF(_new_shares, 0);
      UPDATE public.positions SET shares = _new_shares, avg_price = _new_avg, updated_at = now() WHERE id = _pos.id;
    END IF;
  ELSE
    IF _pos.id IS NULL OR _pos.shares < _quantity THEN
      RAISE EXCEPTION 'Insufficient shares to sell';
    END IF;
    UPDATE public.profiles SET kes_balance = kes_balance + _cost_cents, updated_at = now() WHERE id = _uid;
    UPDATE public.positions SET shares = _pos.shares - _quantity, updated_at = now() WHERE id = _pos.id;
  END IF;

  _q[_i] := _q[_i] + _delta;

  INSERT INTO public.trades (user_id, market_id, outcome, outcome_id, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _side, _quantity, _avg_price, _cost_cents)
  RETURNING id INTO _trade_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

  _idx := 0;
  FOREACH _row_id IN ARRAY _ids LOOP
    _idx := _idx + 1;
    _new_price := public.lmsr_price(_q, _m.liquidity_b, _idx);
    UPDATE public.market_outcomes SET q = _q[_idx], price = _new_price WHERE id = _row_id;
    INSERT INTO public.outcome_price_history (market_id, outcome_id, price)
      VALUES (_market_id, _row_id, _new_price);
  END LOOP;

  UPDATE public.markets
    SET volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.lmsr_state_log (market_id, outcome_id, q_before, q_after, b, cost_delta_cents, trade_id)
    VALUES (_market_id, _outcome_id, _q_before, _q, _m.liquidity_b,
            CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END, _trade_id);

  RETURN jsonb_build_object(
    'ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
    'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
    'trade_id', _trade_id
  );
END;
$function$;

-- ============================================================
-- 2. Support ticket system
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_category AS ENUM ('account','kyc','deposits','withdrawals','trading','bug','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
  category public.ticket_category NOT NULL,
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  status public.ticket_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_msgs_ticket ON public.support_ticket_messages(ticket_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Ticket number generator
CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'SR-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.support_ticket_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_support_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_number();

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tickets RLS
DROP POLICY IF EXISTS "Users see own tickets" ON public.support_tickets;
CREATE POLICY "Users see own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users create own tickets" ON public.support_tickets;
CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins update tickets" ON public.support_tickets;
CREATE POLICY "Admins update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Messages RLS
DROP POLICY IF EXISTS "Read messages for own tickets" ON public.support_ticket_messages;
CREATE POLICY "Read messages for own tickets" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "Reply to own ticket or admin" ON public.support_ticket_messages;
CREATE POLICY "Reply to own ticket or admin" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (NOT is_admin AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()))
      OR
      (is_admin AND public.has_role(auth.uid(), 'admin'))
    )
  );

-- ============================================================
-- 3. is_current_user_admin helper + lock down has_role
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
