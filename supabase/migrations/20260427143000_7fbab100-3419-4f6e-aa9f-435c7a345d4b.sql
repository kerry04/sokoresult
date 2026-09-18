-- Revoke EXECUTE from anon on every SECURITY DEFINER function in public.
-- Each function still enforces auth.uid() / has_role() internally; this is
-- belt-and-braces and silences the Supabase linter.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant to authenticated for the functions end-users legitimately call.
GRANT EXECUTE ON FUNCTION public.execute_lmsr_trade_binary(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_lmsr_trade_multi(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_lmsr_trade(uuid, text, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_public_stats(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_public_positions(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_news_to_markets(uuid[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

-- Admin-only functions get authenticated grant (function checks has_role inside).
GRANT EXECUTE ON FUNCTION public.admin_reset_balance(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescale_liquidity(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_market(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_multi_market(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_lmsr_market(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_lmsr_market_from_signal(uuid, numeric, numeric, numeric) TO authenticated;