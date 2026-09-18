-- ---------- 1. system_settings ----------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings admin read" ON public.system_settings;
DROP POLICY IF EXISTS "settings admin write" ON public.system_settings;
CREATE POLICY "settings admin read" ON public.system_settings FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "settings admin write" ON public.system_settings FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.system_settings(key,value) VALUES
  ('hourly_volume_cap_cents', to_jsonb(5000000::bigint)),
  ('treasury_pct_cap', to_jsonb(0.05)),
  ('signal_blend_weight', to_jsonb(0.10)),
  ('b_confidence_floor', to_jsonb(0.5)),
  ('notional_cap_pct_of_b', to_jsonb(0.25))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_setting_numeric(_key text, _default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value)::text::numeric FROM public.system_settings WHERE key=_key), _default);
$$;

-- ---------- 2. treasury_snapshot ----------
CREATE TABLE IF NOT EXISTS public.treasury_snapshot (
  id smallint PRIMARY KEY DEFAULT 1,
  total_kes_cents bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT only_one CHECK (id = 1)
);
ALTER TABLE public.treasury_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "treasury admin read" ON public.treasury_snapshot;
CREATE POLICY "treasury admin read" ON public.treasury_snapshot FOR SELECT USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.treasury_snapshot(id,total_kes_cents) VALUES (1,0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_treasury()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t bigint;
BEGIN
  SELECT COALESCE(SUM(kes_balance),0) INTO _t FROM public.profiles;
  UPDATE public.treasury_snapshot SET total_kes_cents = _t, refreshed_at = now() WHERE id = 1;
END $$;

-- ---------- 3. user_sessions ----------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip inet,
  fingerprint text,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_uniq ON public.user_sessions(user_id, fingerprint);
CREATE INDEX IF NOT EXISTS user_sessions_ip_idx ON public.user_sessions(ip);
CREATE INDEX IF NOT EXISTS user_sessions_fp_idx ON public.user_sessions(fingerprint);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions self read" ON public.user_sessions;
CREATE POLICY "sessions self read" ON public.user_sessions FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.record_session(_fingerprint text, _user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ip inet;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  BEGIN _ip := inet_client_addr(); EXCEPTION WHEN OTHERS THEN _ip := NULL; END;
  INSERT INTO public.user_sessions(user_id, ip, fingerprint, user_agent)
  VALUES (_uid, _ip, _fingerprint, left(_user_agent, 500))
  ON CONFLICT (user_id, fingerprint) DO UPDATE SET last_seen_at = now(),
    ip = COALESCE(EXCLUDED.ip, public.user_sessions.ip),
    user_agent = EXCLUDED.user_agent;
  UPDATE public.profiles SET last_seen_ip = COALESCE(_ip, last_seen_ip) WHERE id = _uid;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_session(text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_session(text, text) TO authenticated;

-- ---------- 4. market_signals ----------
CREATE TABLE IF NOT EXISTS public.market_signals (
  market_id uuid PRIMARY KEY,
  signal_prob numeric NOT NULL DEFAULT 0.5,
  confidence numeric NOT NULL DEFAULT 0,
  news_count int NOT NULL DEFAULT 0,
  social_count int NOT NULL DEFAULT 0,
  avg_sentiment numeric NOT NULL DEFAULT 0,
  velocity numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signals public read" ON public.market_signals;
CREATE POLICY "signals public read" ON public.market_signals FOR SELECT USING (true);

-- ---------- 5. user_risk_scores ----------
CREATE TABLE IF NOT EXISTS public.user_risk_scores (
  user_id uuid PRIMARY KEY,
  score numeric NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "risk admin read" ON public.user_risk_scores;
CREATE POLICY "risk admin read" ON public.user_risk_scores FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ---------- 6. assert_trade_caps ----------
CREATE OR REPLACE FUNCTION public.assert_trade_caps(_uid uuid, _market_id uuid, _new_cost_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hourly bigint;
  _cap bigint := public.get_setting_numeric('hourly_volume_cap_cents', 5000000)::bigint;
  _treasury bigint;
  _market_vol bigint;
  _market_pct numeric := public.get_setting_numeric('treasury_pct_cap', 0.05);
BEGIN
  SELECT COALESCE(SUM(cost_cents),0) INTO _hourly
    FROM public.trades WHERE user_id = _uid AND created_at > now() - interval '1 hour';
  IF _hourly + _new_cost_cents > _cap THEN
    RAISE EXCEPTION 'HOURLY_CAP: Hourly volume cap (KSh %) reached. Wait before trading more.', _cap/100;
  END IF;
  SELECT COALESCE(total_kes_cents,0) INTO _treasury FROM public.treasury_snapshot WHERE id=1;
  IF _treasury > 0 THEN
    SELECT COALESCE(SUM(cost_cents),0) INTO _market_vol
      FROM public.trades WHERE market_id = _market_id AND created_at > now() - interval '24 hours';
    IF _market_vol + _new_cost_cents > _treasury * _market_pct THEN
      RAISE EXCEPTION 'MARKET_CAP: Market 24h volume cap reached (treasury safeguard).';
    END IF;
  END IF;
END $$;

-- ---------- 7. trade RPCs ----------
CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(_market_id uuid, _outcome text, _side text, _quantity integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD; _q numeric[]; _i int; _delta numeric;
  _cost numeric; _cost_cents bigint; _avg_price numeric;
  _balance bigint; _pos RECORD;
  _new_yes numeric; _new_no numeric;
  _new_shares int; _new_avg numeric;
  _trade_id uuid; _q_before numeric[];
  _max_shares int; _tier smallint; _status text;
  _notional_cap_cents bigint;
  _notional_pct numeric := public.get_setting_numeric('notional_cap_pct_of_b', 0.25);
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

  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _cost_cents := round(abs(_cost) * 100)::bigint;
  _avg_price := abs(_cost) / _quantity;

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  _notional_cap_cents := round(_m.liquidity_b * _notional_pct * 100)::bigint;

  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per outcome (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
    END IF;
    IF (COALESCE(_pos.shares,0) * COALESCE(_pos.avg_price,0) * 100 + _cost_cents) > _notional_cap_cents THEN
      RAISE EXCEPTION 'NOTIONAL_CAP: Position notional cap (KSh %) reached', _notional_cap_cents/100;
    END IF;
  END IF;

  IF _side = 'BUY' THEN
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
    _side || ' ' || _quantity || ' ' || _outcome || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

  UPDATE public.markets
    SET q_yes = _q[1], q_no = _q[2], yes_price = _new_yes, no_price = _new_no,
        volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _new_yes);
  INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents, trade_id)
    VALUES (_market_id, _q_before, _q, _m.liquidity_b,
            CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END, _trade_id);

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
                            'new_yes_price', _new_yes, 'trade_id', _trade_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(_market_id uuid, _outcome_id uuid, _side text, _quantity integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD; _outcome RECORD; _q numeric[]; _ids uuid[];
  _i int; _delta numeric; _cost numeric; _cost_cents bigint; _avg_price numeric;
  _balance bigint; _pos RECORD; _new_shares int; _new_avg numeric;
  _trade_id uuid; _q_before numeric[]; _new_price numeric;
  _idx int; _row_id uuid; _max_shares int; _tier smallint; _status text;
  _notional_cap_cents bigint;
  _notional_pct numeric := public.get_setting_numeric('notional_cap_pct_of_b', 0.25);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier, status INTO _tier, _status FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade'; END IF;
  IF _status IN ('restricted','suspended') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Your account is % — contact support', _status;
  END IF;

  PERFORM public.check_rate_limit('execute_lmsr_trade_multi', 30, 300);

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.market_type <> 'multi' THEN RAISE EXCEPTION 'Not a multi-outcome market'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  PERFORM 1 FROM public.market_outcomes WHERE market_id = _market_id FOR UPDATE;

  SELECT array_agg(q ORDER BY sort_order, created_at), array_agg(id ORDER BY sort_order, created_at)
    INTO _q, _ids FROM public.market_outcomes WHERE market_id = _market_id;

  _i := array_position(_ids, _outcome_id);
  IF _i IS NULL THEN RAISE EXCEPTION 'Outcome not in market'; END IF;
  SELECT * INTO _outcome FROM public.market_outcomes WHERE id = _outcome_id;

  _q_before := _q;
  _delta := CASE WHEN _side = 'BUY' THEN _quantity ELSE -_quantity END;
  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _cost_cents := round(abs(_cost) * 100)::bigint;
  _avg_price := abs(_cost) / _quantity;

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome_id = _outcome_id FOR UPDATE;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  _notional_cap_cents := round(_m.liquidity_b * _notional_pct * 100)::bigint;

  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per candidate (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
    END IF;
    IF (COALESCE(_pos.shares,0) * COALESCE(_pos.avg_price,0) * 100 + _cost_cents) > _notional_cap_cents THEN
      RAISE EXCEPTION 'NOTIONAL_CAP: Position notional cap (KSh %) reached', _notional_cap_cents/100;
    END IF;
  END IF;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now() WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, outcome_id, shares, avg_price)
      VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _quantity, _avg_price);
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

  INSERT INTO public.trades (user_id, market_id, outcome, outcome_id, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _side, _quantity, _avg_price, _cost_cents)
  RETURNING id INTO _trade_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

  _idx := 0;
  FOREACH _row_id IN ARRAY _ids LOOP
    _idx := _idx + 1;
    _new_price := public.lmsr_price(_q, _m.liquidity_b, _idx);
    UPDATE public.market_outcomes SET q = _q[_idx], price = _new_price WHERE id = _row_id;
    INSERT INTO public.outcome_price_history (market_id, outcome_id, price)
      VALUES (_market_id, _row_id, _new_price);
  END LOOP;

  UPDATE public.markets
    SET volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.lmsr_state_log (market_id, outcome_id, q_before, q_after, b, cost_delta_cents, trade_id)
    VALUES (_market_id, _outcome_id, _q_before, _q, _m.liquidity_b,
            CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END, _trade_id);

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
                            'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
                            'trade_id', _trade_id);
END;
$function$;

-- ---------- 8. UI: trade limits ----------
CREATE OR REPLACE FUNCTION public.get_user_trade_limits(_market_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _hourly bigint;
  _cap bigint := public.get_setting_numeric('hourly_volume_cap_cents', 5000000)::bigint;
  _b numeric;
  _notional_pct numeric := public.get_setting_numeric('notional_cap_pct_of_b', 0.25);
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT COALESCE(SUM(cost_cents),0) INTO _hourly
    FROM public.trades WHERE user_id = _uid AND created_at > now() - interval '1 hour';
  SELECT liquidity_b INTO _b FROM public.markets WHERE id = _market_id;
  RETURN jsonb_build_object(
    'hourly_used_cents', _hourly, 'hourly_cap_cents', _cap,
    'hourly_remaining_cents', GREATEST(0, _cap - _hourly),
    'notional_cap_cents', round(COALESCE(_b,0) * _notional_pct * 100)::bigint
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.get_user_trade_limits(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_trade_limits(uuid) TO authenticated;

-- ---------- 9. Improved syndicate detection (new shape) ----------
CREATE OR REPLACE FUNCTION public.admin_detect_syndicates(_window_minutes int DEFAULT 60)
RETURNS TABLE(
  cluster_key text, market_id uuid, question text, outcome text,
  user_count int, total_quantity bigint, total_cost_cents bigint,
  user_ids uuid[], display_names text[],
  shared_ip_count int, shared_fingerprint_count int, suspicion_score numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.market_id, m.question, t.outcome, t.user_id, p.display_name, t.quantity, t.cost_cents
    FROM public.trades t
    JOIN public.markets m ON m.id = t.market_id
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE t.created_at > now() - make_interval(mins => _window_minutes) AND t.side = 'BUY'
  ), grouped AS (
    SELECT (b.market_id::text || ':' || b.outcome) AS cluster_key,
           b.market_id, max(b.question) AS question, b.outcome,
           count(DISTINCT b.user_id)::int AS user_count,
           sum(b.quantity)::bigint AS total_quantity,
           sum(b.cost_cents)::bigint AS total_cost_cents,
           array_agg(DISTINCT b.user_id) AS user_ids,
           array_agg(DISTINCT b.display_name) AS display_names
    FROM base b GROUP BY b.market_id, b.outcome
    HAVING count(DISTINCT b.user_id) >= 2
  )
  SELECT g.cluster_key, g.market_id, g.question, g.outcome,
         g.user_count, g.total_quantity, g.total_cost_cents, g.user_ids, g.display_names,
         (SELECT count(*)::int FROM (
           SELECT s.ip FROM public.user_sessions s WHERE s.user_id = ANY(g.user_ids) AND s.ip IS NOT NULL
           GROUP BY s.ip HAVING count(DISTINCT s.user_id) > 1) x) AS shared_ip_count,
         (SELECT count(*)::int FROM (
           SELECT s.fingerprint FROM public.user_sessions s WHERE s.user_id = ANY(g.user_ids) AND s.fingerprint IS NOT NULL
           GROUP BY s.fingerprint HAVING count(DISTINCT s.user_id) > 1) y) AS shared_fingerprint_count,
         LEAST(1.0,
           (g.user_count::numeric / 10) * 0.3 +
           (CASE WHEN (SELECT count(*) FROM (
             SELECT s.ip FROM public.user_sessions s WHERE s.user_id = ANY(g.user_ids) AND s.ip IS NOT NULL
             GROUP BY s.ip HAVING count(DISTINCT s.user_id) > 1) z) > 0 THEN 0.4 ELSE 0 END) +
           (CASE WHEN (SELECT count(*) FROM (
             SELECT s.fingerprint FROM public.user_sessions s WHERE s.user_id = ANY(g.user_ids) AND s.fingerprint IS NOT NULL
             GROUP BY s.fingerprint HAVING count(DISTINCT s.user_id) > 1) w) > 0 THEN 0.3 ELSE 0 END)
         ) AS suspicion_score
  FROM grouped g
  ORDER BY suspicion_score DESC, g.user_count DESC
  LIMIT 100;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_detect_syndicates(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_detect_syndicates(int) TO authenticated;

-- ---------- 10. Compute signal ----------
CREATE OR REPLACE FUNCTION public.compute_market_signal(_market_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _kw text[]; _news_count int := 0; _social_count int := 0;
  _avg_sent numeric := 0; _mentions_1h int := 0; _mentions_prev int := 0;
  _velocity numeric := 1; _signal numeric; _conf numeric;
BEGIN
  SELECT keywords INTO _kw FROM public.markets WHERE id = _market_id;
  IF _kw IS NULL OR array_length(_kw,1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_keywords');
  END IF;
  SELECT count(*), COALESCE(AVG(sentiment_score),0) INTO _news_count, _avg_sent
    FROM public.raw_news_data
   WHERE published_at > now() - interval '24 hours' AND relevant_keywords && _kw;
  SELECT count(*) INTO _social_count
    FROM public.social_posts WHERE posted_at > now() - interval '24 hours' AND keyword = ANY(_kw);
  SELECT count(*) INTO _mentions_1h FROM public.raw_news_data
    WHERE published_at > now() - interval '1 hour' AND relevant_keywords && _kw;
  SELECT count(*) INTO _mentions_prev FROM public.raw_news_data
    WHERE published_at > now() - interval '2 hours' AND published_at <= now() - interval '1 hour' AND relevant_keywords && _kw;
  _velocity := _mentions_1h::numeric / GREATEST(_mentions_prev,1);
  _signal := GREATEST(0.05, LEAST(0.95, 0.5 + 0.5 * tanh(_avg_sent * ln(1 + GREATEST(_news_count + _social_count, 0)))));
  _conf := GREATEST(0, LEAST(1, (_news_count::numeric/10 + _social_count::numeric/50 + LEAST(_velocity,3)/3) / 3));
  INSERT INTO public.market_signals(market_id, signal_prob, confidence, news_count, social_count, avg_sentiment, velocity, computed_at)
  VALUES (_market_id, _signal, _conf, _news_count, _social_count, _avg_sent, _velocity, now())
  ON CONFLICT (market_id) DO UPDATE SET
    signal_prob = EXCLUDED.signal_prob, confidence = EXCLUDED.confidence,
    news_count = EXCLUDED.news_count, social_count = EXCLUDED.social_count,
    avg_sentiment = EXCLUDED.avg_sentiment, velocity = EXCLUDED.velocity, computed_at = now();
  RETURN jsonb_build_object('ok', true, 'signal_prob', _signal, 'confidence', _conf);
END $$;

-- ---------- 11. apply_signal_to_market ----------
CREATE OR REPLACE FUNCTION public.apply_signal_to_market(_market_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m RECORD; _s RECORD;
  _last_trade_at timestamptz;
  _blend numeric := public.get_setting_numeric('signal_blend_weight', 0.10);
  _floor numeric := public.get_setting_numeric('b_confidence_floor', 0.5);
  _new_yes numeric; _new_b numeric; _q_total numeric; _delta_p numeric;
  _q_before numeric[]; _q_after numeric[]; _diff numeric;
BEGIN
  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND OR _m.market_type <> 'binary' OR _m.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_eligible');
  END IF;
  SELECT * INTO _s FROM public.market_signals WHERE market_id = _market_id;
  IF NOT FOUND OR _s.confidence < 0.1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_signal');
  END IF;
  SELECT max(created_at) INTO _last_trade_at FROM public.trades WHERE market_id = _market_id;
  IF _last_trade_at IS NOT NULL AND _last_trade_at > now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'recent_trade');
  END IF;

  _new_yes := (1 - _blend) * _m.yes_price + _blend * _s.signal_prob;
  _delta_p := abs(_new_yes - _m.yes_price);
  IF _delta_p < 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'noise');
  END IF;

  _new_b := GREATEST(_m.liquidity_b * _floor,
                     _m.liquidity_b * (_floor + (1 - _floor) * _s.confidence));
  _q_before := ARRAY[_m.q_yes, _m.q_no]::numeric[];
  _q_total := COALESCE(_m.q_yes,0) + COALESCE(_m.q_no,0);
  _diff := _new_b * ln(_new_yes / (1 - _new_yes));

  UPDATE public.markets
    SET yes_price = _new_yes, no_price = 1 - _new_yes,
        q_yes = (_q_total + _diff) / 2,
        q_no  = (_q_total - _diff) / 2,
        liquidity_b = _new_b,
        updated_at = now()
  WHERE id = _market_id
  RETURNING ARRAY[q_yes, q_no]::numeric[] INTO _q_after;

  INSERT INTO public.price_history(market_id, yes_price) VALUES (_market_id, _new_yes);
  INSERT INTO public.lmsr_state_log(market_id, q_before, q_after, b, cost_delta_cents)
    VALUES (_market_id, _q_before, _q_after, _new_b, 0);
  INSERT INTO public.audit_events(kind, market_id, payload)
    VALUES ('signal_update', _market_id,
      jsonb_build_object('old_yes', _m.yes_price, 'new_yes', _new_yes, 'confidence', _s.confidence, 'new_b', _new_b));

  RETURN jsonb_build_object('ok', true, 'new_yes', _new_yes, 'new_b', _new_b);
END $$;

-- ---------- 12. true value + edge ----------
CREATE OR REPLACE FUNCTION public.compute_true_value(_market_id uuid)
RETURNS TABLE(true_prob numeric, market_prob numeric, edge numeric, confidence numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.signal_prob, m.yes_price) AS true_prob,
         m.yes_price AS market_prob,
         COALESCE(s.signal_prob, m.yes_price) - m.yes_price AS edge,
         COALESCE(s.confidence, 0) AS confidence
  FROM public.markets m
  LEFT JOIN public.market_signals s ON s.market_id = m.id
  WHERE m.id = _market_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_edge_opportunities(_limit int DEFAULT 20)
RETURNS TABLE(market_id uuid, question text, market_prob numeric, signal_prob numeric, edge numeric, confidence numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT m.id, m.question, m.yes_price, s.signal_prob,
         (s.signal_prob - m.yes_price) AS edge, s.confidence
  FROM public.markets m
  JOIN public.market_signals s ON s.market_id = m.id
  WHERE m.status = 'open' AND s.confidence >= 0.2
  ORDER BY abs(s.signal_prob - m.yes_price) DESC
  LIMIT LEAST(_limit, 100);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_edge_opportunities(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_edge_opportunities(int) TO authenticated;

-- ---------- 13. Run all signals ----------
CREATE OR REPLACE FUNCTION public.run_signal_update_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m RECORD; _processed int := 0; _applied int := 0; _r jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR _m IN SELECT id FROM public.markets WHERE status = 'open' LOOP
    PERFORM public.compute_market_signal(_m.id);
    _processed := _processed + 1;
    SELECT public.apply_signal_to_market(_m.id) INTO _r;
    IF (_r->>'ok')::boolean THEN _applied := _applied + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('processed', _processed, 'applied', _applied);
END $$;
REVOKE EXECUTE ON FUNCTION public.run_signal_update_all() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_signal_update_all() TO authenticated;

-- ---------- 14. Risk scoring ----------
CREATE OR REPLACE FUNCTION public.score_user_behavior()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u RECORD; _scored int := 0;
BEGIN
  FOR _u IN
    SELECT t.user_id,
           count(*) FILTER (WHERE t.cost_cents > 50000) AS big_trades,
           count(*) AS total_trades,
           COALESCE(SUM(t.cost_cents),0) AS total_volume
    FROM public.trades t
    WHERE t.created_at > now() - interval '7 days'
    GROUP BY t.user_id
  LOOP
    INSERT INTO public.user_risk_scores(user_id, score, reasons, updated_at)
    VALUES (_u.user_id,
      LEAST(1.0, (_u.big_trades::numeric/10)*0.5 + (LEAST(_u.total_trades,200)::numeric/200)*0.5),
      jsonb_build_object('big_trades', _u.big_trades, 'total_trades', _u.total_trades, 'total_volume', _u.total_volume),
      now())
    ON CONFLICT (user_id) DO UPDATE SET
      score = EXCLUDED.score, reasons = EXCLUDED.reasons, updated_at = now();
    _scored := _scored + 1;
  END LOOP;
  INSERT INTO public.admin_alerts(kind, severity, user_id, payload)
  SELECT 'suspicious_user', 'warning', user_id, reasons
  FROM public.user_risk_scores r
  WHERE r.score >= 0.7
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_alerts a
      WHERE a.kind='suspicious_user' AND a.user_id = r.user_id
        AND a.created_at > now() - interval '24 hours');
  RETURN jsonb_build_object('scored', _scored);
END $$;
REVOKE EXECUTE ON FUNCTION public.score_user_behavior() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.score_user_behavior() TO authenticated;

SELECT public.refresh_treasury();