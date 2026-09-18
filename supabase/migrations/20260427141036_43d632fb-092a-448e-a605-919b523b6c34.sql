
-- 1. Replace the public-read policy on profiles with owner/admin only
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles owner or admin read"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 2. Public-safe view for display_name / avatar lookups (comments, leaderboard fallback)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = on) AS
  SELECT id, display_name, avatar_url, created_at
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- 3. Trigger: block non-admins from mutating sensitive columns on profiles
CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot change profile id';
  END IF;
  IF NEW.kes_balance IS DISTINCT FROM OLD.kes_balance THEN
    RAISE EXCEPTION 'Balance can only be changed by the system';
  END IF;
  IF NEW.oko_balance IS DISTINCT FROM OLD.oko_balance THEN
    RAISE EXCEPTION 'Balance can only be changed by the system';
  END IF;
  IF NEW.kyc_tier IS DISTINCT FROM OLD.kyc_tier THEN
    RAISE EXCEPTION 'KYC tier can only be changed by the system';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'Referral code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_columns();

-- 4. Lock down user_roles: only admins can INSERT / UPDATE / DELETE
CREATE POLICY "Admins insert roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update roles"
  ON public.user_roles
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete roles"
  ON public.user_roles
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
