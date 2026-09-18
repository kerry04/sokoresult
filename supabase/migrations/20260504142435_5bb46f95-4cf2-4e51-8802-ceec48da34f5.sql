-- ============================================================
-- 1. Settings: binary share cap parity with multi
-- ============================================================
INSERT INTO public.system_settings(key, value) VALUES
  ('binary_share_cap_pct_of_b', to_jsonb(0.25))
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. seed_market_priors — write q from initial probability
--    so engine price == displayed AI prior
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_market_priors(_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m RECORD;
  _b numeric;
  _p numeric;
  _q_yes numeric;
  _q_no numeric;
  _n int;
  _ref numeric;
  _outcome RECORD;
  _q_arr numeric[];
  _ids uuid[];
  _prices numeric[];
  _idx int;
  _new_price numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can seed markets';
  END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Cannot seed a non-open market'; END IF;

  _b := _m.liquidity_b;
  IF _b IS NULL OR _b <= 0 THEN RAISE EXCEPTION 'Invalid liquidity_b'; END IF;

  IF _m.market_type = 'binary' THEN
    -- Refuse if any trades already happened
    IF EXISTS (SELECT 1 FROM public.trades WHERE market_id = _market_id) THEN
      RAISE EXCEPTION 'Refusing to seed: trades already exist for this market';
    END IF;

    _p := COALESCE(_m.initial_prob, _m.yes_price, 0.5);
    -- Clamp to (0.01, 0.99) to keep q finite
    _p := LEAST(0.99, GREATEST(0.01, _p));

    -- For binary with reference 0.5: q_yes = b*ln(2p), q_no = b*ln(2(1-p))
    -- This yields P(yes) = exp(q_yes/b)/(exp(q_yes/b)+exp(q_no/b)) = p
    _q_yes := _b * ln(2.0 * _p);
    _q_no  := _b * ln(2.0 * (1.0 - _p));

    UPDATE public.markets
       SET q_yes = _q_yes,
           q_no  = _q_no,
           yes_price = _p,
           no_price  = 1.0 - _p,
           updated_at = now()
     WHERE id = _market_id;

    INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents)
      VALUES (_market_id, ARRAY[0,0]::numeric[], ARRAY[_q_yes, _q_no]::numeric[], _b, 0);
    INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _p);

    RETURN jsonb_build_object('ok', true, 'type', 'binary', 'p', _p, 'q_yes', _q_yes, 'q_no', _q_no);
  ELSE
    -- Multi: read outcomes ordered, normalize prices, seed q_i = b*ln(n*p_i)
    IF EXISTS (SELECT 1 FROM public.trades WHERE market_id = _market_id) THEN
      RAISE EXCEPTION 'Refusing to seed: trades already exist for this market';
    END IF;

    SELECT array_agg(id ORDER BY sort_order, created_at),
           array_agg(GREATEST(0.01, COALESCE(price, 0)) ORDER BY sort_order, created_at)
      INTO _ids, _prices
      FROM public.market_outcomes WHERE market_id = _market_id;

    _n := COALESCE(array_length(_ids, 1), 0);
    IF _n < 2 THEN RAISE EXCEPTION 'Multi market needs >= 2 outcomes'; END IF;

    -- Normalize prices to sum to 1
    DECLARE _sum numeric := 0;
    BEGIN
      FOR _idx IN 1.._n LOOP _sum := _sum + _prices[_idx]; END LOOP;
      IF _sum <= 0 THEN RAISE EXCEPTION 'Outcome prices sum to zero'; END IF;
      FOR _idx IN 1.._n LOOP
        _prices[_idx] := LEAST(0.99, GREATEST(0.01, _prices[_idx] / _sum));
      END LOOP;
    END;

    _q_arr := ARRAY[]::numeric[];
    FOR _idx IN 1.._n LOOP
      _q_arr := array_append(_q_arr, _b * ln(_n::numeric * _prices[_idx]));
    END LOOP;

    -- Write q + recompute price from LMSR (canonical, not the raw input)
    FOR _idx IN 1.._n LOOP
      _new_price := public.lmsr_price(_q_arr, _b, _idx);
      UPDATE public.market_outcomes
         SET q = _q_arr[_idx],
             price = _new_price
       WHERE id = _ids[_idx];
      INSERT INTO public.outcome_price_history (market_id, outcome_id, price)
        VALUES (_market_id, _ids[_idx], _new_price);
    END LOOP;

    INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents)
      VALUES (_market_id,
              (SELECT array_agg(0 ORDER BY i) FROM generate_series(1, _n) i)::numeric[],
              _q_arr, _b, 0);

    RETURN jsonb_build_object('ok', true, 'type', 'multi', 'n', _n);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_market_priors(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.seed_market_priors(uuid) TO authenticated;

-- ============================================================
-- 3. Patch execute_lmsr_trade_binary to use the settings-driven cap
--    (mirrors the multi behavior; replaces hardcoded 0.20)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(
  _market_id uuid, _outcome text, _side text, _quantity int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _q numeric[]; _i int; _delta numeric;
  _cost numeric; _gross_cents bigint; _fee_cents bigint; _cost_cents bigint;
  _avg_price numeric;
  _balance bigint; _pos RECORD;
  _new_yes numeric; _new_no numeric;
  _new_shares int; _new_avg numeric;
  _trade_id uuid; _q_before numeric[];
  _tier smallint; _status text;
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _max_mult numeric := public.get_setting_numeric('max_payout_multiplier', 20);
  _share_pct numeric := public.get_setting_numeric('binary_share_cap_pct_of_b', 0.25);
  _notional_pct numeric := public.get_setting_numeric('notional_cap_pct_of_b', 0.60);
  _max_shares int;
  _notional_cap_cents bigint;
  _price_before numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier, status INTO _tier, _status FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade'; END IF;
  IF _status IN ('restricted','suspended') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Your account is % — contact support', _status;
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

  _price_before := public.lmsr_price(_q, _m.liquidity_b, _i);

  IF _side = 'BUY' AND _price_before > 0 AND (1.0 / _price_before) > _max_mult THEN
    RAISE EXCEPTION 'LONGSHOT_BLOCKED: This bet is too long-shot — pick a more realistic outcome';
  END IF;

  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _gross_cents := round(abs(_cost) * 100)::bigint;
  IF _side = 'BUY' THEN
    _fee_cents := round(_gross_cents * _fee_bps / 10000.0)::bigint;
    _cost_cents := _gross_cents + _fee_cents;
  ELSE
    _fee_cents := 0;
    _cost_cents := _gross_cents;
  END IF;
  _avg_price := _cost_cents::numeric / 100.0 / _quantity;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * _share_pct)::int);
  _notional_cap_cents := round(_m.liquidity_b * _notional_pct * 100)::bigint;

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per outcome (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
    END IF;
    IF (COALESCE(_pos.shares,0) * COALESCE(_pos.avg_price,0) * 100 + _cost_cents) > _notional_cap_cents THEN
      RAISE EXCEPTION 'NOTIONAL_CAP: Position notional cap (KSh %) reached', _notional_cap_cents/100;
    END IF;

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
    _side || ' ' || _quantity || ' ' || _outcome || ' @ ' || round(_avg_price * 100) || 'c — ' || _m.question);

  IF _fee_cents > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (_uid, 'fee', 0, 'House fee ' || (_fee_bps::numeric/100) || '% — KSh ' || round(_fee_cents/100.0, 2));
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'fee_cents', _fee_cents,
                            'avg_price', _avg_price, 'new_yes_price', _new_yes, 'trade_id', _trade_id);
END;
$$;

-- ============================================================
-- 4. resolve_market — append final audit row + log subsidy
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_market(_market_id uuid, _outcome boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pos RECORD;
  payout_cents BIGINT;
  total_payout_cents BIGINT := 0;
  total_revenue_cents BIGINT := 0;
  total_fee_cents BIGINT := 0;
  winning_outcome TEXT;
  _m RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve markets';
  END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.status = 'resolved' THEN RAISE EXCEPTION 'Market already resolved'; END IF;

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
    payout_cents := pos.shares * 100;
    total_payout_cents := total_payout_cents + payout_cents;
    UPDATE public.profiles
    SET kes_balance = kes_balance + payout_cents,
        updated_at = now()
    WHERE id = pos.user_id;

    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (pos.user_id, 'payout', payout_cents,
      'Market resolved ' || winning_outcome || ' — ' || pos.shares || ' shares');
  END LOOP;

  -- Compute realized cashflow for the audit row
  SELECT
    COALESCE(SUM(CASE WHEN side = 'BUY' THEN cost_cents ELSE -cost_cents END), 0)
    INTO total_revenue_cents
    FROM public.trades WHERE market_id = _market_id;

  -- Final audit row: q_after = current q, cost_delta = realized subsidy
  -- subsidy = payouts - revenue (positive = platform paid out more than it took)
  INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents)
    VALUES (_market_id,
            ARRAY[_m.q_yes, _m.q_no]::numeric[],
            ARRAY[_m.q_yes, _m.q_no]::numeric[],
            _m.liquidity_b,
            (total_payout_cents - total_revenue_cents));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_market(uuid, boolean) FROM anon, authenticated;

-- ============================================================
-- 5. resolve_multi_market — same final audit row treatment
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_multi_market(
  _market_id uuid,
  _winning_outcome_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pos RECORD;
  payout_cents bigint;
  total_payout_cents bigint := 0;
  total_revenue_cents bigint := 0;
  winner_label text;
  _m RECORD;
  _q_now numeric[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve markets';
  END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.status = 'resolved' THEN RAISE EXCEPTION 'Market already resolved'; END IF;

  SELECT label INTO winner_label FROM public.market_outcomes
    WHERE id = _winning_outcome_id AND market_id = _market_id;
  IF winner_label IS NULL THEN
    RAISE EXCEPTION 'Winning outcome not found for this market';
  END IF;

  UPDATE public.market_outcomes
    SET is_winner = (id = _winning_outcome_id)
    WHERE market_id = _market_id;

  UPDATE public.markets
    SET status = 'resolved',
        resolved_outcome_id = _winning_outcome_id,
        updated_at = now()
    WHERE id = _market_id;

  FOR pos IN
    SELECT * FROM public.positions
    WHERE market_id = _market_id AND outcome_id = _winning_outcome_id AND shares > 0
  LOOP
    payout_cents := pos.shares * 100;
    total_payout_cents := total_payout_cents + payout_cents;
    UPDATE public.profiles
      SET kes_balance = kes_balance + payout_cents, updated_at = now()
      WHERE id = pos.user_id;

    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (pos.user_id, 'payout', payout_cents,
      'Market resolved: ' || winner_label || ' won — ' || pos.shares || ' shares');
  END LOOP;

  SELECT
    COALESCE(SUM(CASE WHEN side = 'BUY' THEN cost_cents ELSE -cost_cents END), 0)
    INTO total_revenue_cents
    FROM public.trades WHERE market_id = _market_id;

  SELECT array_agg(q ORDER BY sort_order, created_at) INTO _q_now
    FROM public.market_outcomes WHERE market_id = _market_id;

  INSERT INTO public.lmsr_state_log (market_id, outcome_id, q_before, q_after, b, cost_delta_cents)
    VALUES (_market_id, _winning_outcome_id, _q_now, _q_now, _m.liquidity_b,
            (total_payout_cents - total_revenue_cents));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_multi_market(uuid, uuid) FROM anon, authenticated;

-- ============================================================
-- 6. market_subsidy_estimate view — admin-only via RLS-bearing base table
-- ============================================================
CREATE OR REPLACE VIEW public.market_subsidy_estimate
WITH (security_invoker = true) AS
SELECT
  m.id AS market_id,
  m.slug,
  m.question,
  m.market_type,
  m.status,
  m.liquidity_b,
  CASE
    WHEN m.market_type = 'binary' THEN m.liquidity_b * ln(2.0)
    ELSE m.liquidity_b * ln(GREATEST(2, COALESCE(
      (SELECT COUNT(*)::numeric FROM public.market_outcomes WHERE market_id = m.id), 2)))
  END AS max_subsidy_kes,
  COALESCE((
    SELECT SUM(CASE WHEN side = 'BUY' THEN cost_cents ELSE -cost_cents END)
    FROM public.trades WHERE market_id = m.id
  ), 0)::numeric / 100.0 AS realized_revenue_kes,
  COALESCE((
    SELECT SUM(amount_cents)
    FROM public.transactions tx
    WHERE tx.type = 'payout'
      AND tx.description LIKE '%' || m.question || '%'
  ), 0)::numeric / 100.0 AS realized_payout_kes
FROM public.markets m;

REVOKE ALL ON public.market_subsidy_estimate FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.market_subsidy_estimate TO authenticated;
-- The view has security_invoker = true and reads from markets/trades/transactions
-- which already have RLS; admins see all, regular users see only their own trades/payouts.

-- ============================================================
-- 7. Realtime channel scoping (security finding)
--    Ensure RLS on realtime.messages so users only subscribe to their own topics.
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own user channels" ON realtime.messages;
CREATE POLICY "Users subscribe to own user channels"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    -- Per-user topics: user:<uid>:* (notifications, trade events scoped to caller)
    (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%')
    -- Per-market public broadcasts (price/activity); these contain no PII
    OR (realtime.topic() LIKE 'market:%')
    -- Admins can subscribe to anything (admin alerts, ops dashboards)
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Authed broadcast to own user channels" ON realtime.messages;
CREATE POLICY "Authed broadcast to own user channels"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Note: postgres_changes (table-level subscriptions) still apply table RLS,
-- so users only receive INSERTs on rows they could SELECT. Existing trades/
-- notifications/admin_alerts RLS already restricts those streams correctly.
