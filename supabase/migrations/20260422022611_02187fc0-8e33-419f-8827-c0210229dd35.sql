
-- Seed CEO admin account
DO $$
DECLARE
  new_user_id UUID;
  hashed_pw TEXT;
BEGIN
  -- Skip if already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'ceo@sokoresult.com') THEN
    RAISE NOTICE 'ceo@sokoresult.com already exists';
    RETURN;
  END IF;

  new_user_id := gen_random_uuid();
  -- bcrypt hash of "ChangeMe123!" — MUST be rotated on first login
  hashed_pw := crypt('ChangeMe123!', gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ceo@sokoresult.com',
    hashed_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"CEO"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  -- Identity row (required for password sign-in)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'ceo@sokoresult.com', 'email_verified', true),
    'email', new_user_id::text,
    now(), now(), now()
  );

  -- Grant admin role (the enforce_admin_domain trigger allows @sokoresult.com)
  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin');
END $$;
