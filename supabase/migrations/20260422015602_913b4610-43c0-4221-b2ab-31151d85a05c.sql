-- 1. Avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. Enforce sokoresult.com domain for admin role grants
CREATE OR REPLACE FUNCTION public.enforce_admin_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  IF NEW.role = 'admin' THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
    IF user_email IS NULL OR user_email NOT ILIKE '%@sokoresult.com' THEN
      RAISE EXCEPTION 'Admin role can only be granted to @sokoresult.com email addresses';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_domain_trigger ON public.user_roles;
CREATE TRIGGER enforce_admin_domain_trigger
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_domain();

-- 3. is_admin convenience function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- 4. Add admin market metadata columns
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS resolution_source TEXT;

-- 5. Resolve market function (admin only) — settles market and credits winners
CREATE OR REPLACE FUNCTION public.resolve_market(_market_id uuid, _outcome boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pos RECORD;
  payout_cents BIGINT;
  winning_outcome TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve markets';
  END IF;

  winning_outcome := CASE WHEN _outcome THEN 'YES' ELSE 'NO' END;

  UPDATE public.markets
  SET status = 'resolved',
      resolved_outcome = _outcome,
      updated_at = now()
  WHERE id = _market_id;

  FOR pos IN
    SELECT * FROM public.positions
    WHERE market_id = _market_id AND outcome = winning_outcome AND shares > 0
  LOOP
    payout_cents := pos.shares * 100; -- 1 share = 1 KES at resolution
    UPDATE public.profiles
    SET kes_balance = kes_balance + payout_cents,
        updated_at = now()
    WHERE id = pos.user_id;

    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (pos.user_id, 'payout', payout_cents,
      'Market resolved ' || winning_outcome || ' — ' || pos.shares || ' shares');
  END LOOP;
END;
$$;