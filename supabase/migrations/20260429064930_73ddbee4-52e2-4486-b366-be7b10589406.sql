-- Fix engagement trigger guard + add test-mode KYC verify RPC

-- 1. Relax guard: stop blocking streak fields (RPC writes them; non-owners can't update via RLS anyway)
CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Cannot change profile id'; END IF;
  IF NEW.kes_balance IS DISTINCT FROM OLD.kes_balance THEN RAISE EXCEPTION 'Balance can only be changed by the system'; END IF;
  IF NEW.oko_balance IS DISTINCT FROM OLD.oko_balance THEN RAISE EXCEPTION 'Balance can only be changed by the system'; END IF;
  IF NEW.kyc_tier IS DISTINCT FROM OLD.kyc_tier THEN RAISE EXCEPTION 'KYC tier can only be changed by the system'; END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN RAISE EXCEPTION 'Referral code is immutable'; END IF;
  RETURN NEW;
END;
$$;

-- 2. Test-mode self-verify (sets kyc_tier=1 for the calling user). Bypasses guard.
CREATE OR REPLACE FUNCTION public.set_self_kyc_verified()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.profiles
     SET kyc_tier = GREATEST(kyc_tier, 1), updated_at = now()
   WHERE id = _uid;
  PERFORM set_config('app.bypass_profile_guard', 'off', true);
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_self_kyc_verified() TO authenticated;