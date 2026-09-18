-- 1. Avatars: drop the broad bucket-wide SELECT policy. Public bucket files
-- are still accessible via their public URL; this just blocks anonymous
-- LIST/enumeration of all files via the storage API.
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;

-- Owner can list/select their own avatar (e.g. for replace/delete UIs).
CREATE POLICY "Avatars owner list"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2. KYC documents: add explicit UPDATE and DELETE owner policies so a user
-- can replace or remove a rejected submission.
CREATE POLICY "KYC owner update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "KYC owner delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3. SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated for
-- admin-only operations. The functions already check has_role() internally,
-- but explicit revokes silence the linter and provide defense in depth.
REVOKE EXECUTE ON FUNCTION public.admin_reset_balance(uuid, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rescale_liquidity(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_market(uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_multi_market(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_lmsr_market(uuid, numeric, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_lmsr_market_from_signal(uuid, numeric, numeric, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_news_to_markets(uuid[], integer) FROM anon;

-- Internal trigger / helper functions — no one should call directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_kyc_approval() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_admin_domain() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_sensitive_columns() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_seed_market_lmsr() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_seed_outcome_q() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_public_sokoresult_signup() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;