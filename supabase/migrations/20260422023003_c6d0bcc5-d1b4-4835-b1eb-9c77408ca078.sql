
-- Prevent anyone from signing up with a @sokoresult.com email unless an admin
-- is creating the account (e.g. via service role or the seed migration).
CREATE OR REPLACE FUNCTION public.block_public_sokoresult_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email ILIKE '%@sokoresult.com' THEN
    -- Allow if the inserter is the postgres/service role (no auth context),
    -- block if it's a normal authenticated/anon signup flow.
    IF auth.uid() IS NOT NULL OR current_setting('request.jwt.claim.role', true) = 'anon' THEN
      RAISE EXCEPTION 'The @sokoresult.com domain is reserved for staff. Contact your administrator.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_public_sokoresult_signup ON auth.users;
CREATE TRIGGER block_public_sokoresult_signup
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.block_public_sokoresult_signup();
