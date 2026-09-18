CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- streak fields, last_trade_date, sound_enabled, display_name, avatar_url, etc. are allowed
  RETURN NEW;
END;
$function$;