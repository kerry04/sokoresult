CREATE OR REPLACE FUNCTION public.set_self_kyc_unverified()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.profiles SET kyc_tier = 0 WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_self_kyc_unverified() TO authenticated;