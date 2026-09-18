
-- ============================================================
-- 1. Schema additions
-- ============================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS liquidity_b numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS q_yes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS q_no  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_prob numeric;

ALTER TABLE public.market_outcomes
  ADD COLUMN IF NOT EXISTS q numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Audit & rate-limit tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lmsr_state_log (
  id bigserial PRIMARY KEY,
  market_id uuid NOT NULL,
  outcome_id uuid,
  q_before numeric[],
  q_after numeric[],
  b numeric NOT NULL,
  cost_delta_cents bigint NOT NULL,
  trade_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lmsr_state_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LMSR log admins read" ON public.lmsr_state_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  market_id uuid,
  kind text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit admins read" ON public.audit_events
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.rpc_call_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  fn text NOT NULL,
  market_id uuid,
  called_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpc_call_log_user_fn_time
  ON public.rpc_call_log (user_id, fn, called_at DESC);
ALTER TABLE public.rpc_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rpc log self read" ON public.rpc_call_log
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3. LMSR math helpers (numerically stable via log-sum-exp)
-- ============================================================

CREATE OR REPLACE FUNCTION public.lmsr_cost(_q numeric[], _b numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _max numeric;
  _sum numeric := 0;
  _x numeric;
BEGIN
  IF _b IS NULL OR _b <= 0 THEN RAISE EXCEPTION 'b must be > 0'; END IF;
  IF _q IS NULL OR array_length(_q, 1) IS NULL THEN RETURN 0; END IF;

  SELECT MAX(v / _b) INTO _max FROM unnest(_q) v;
  FOREACH _x IN ARRAY _q LOOP
    _sum := _sum + exp((_x / _b) - _max);
  END LOOP;
  RETURN _b * (_max + ln(_sum));
END;
$$;

CREATE OR REPLACE FUNCTION public.lmsr_price(_q numeric[], _b numeric, _i int)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _max numeric;
  _sum numeric := 0;
  _x numeric;
BEGIN
  IF _b IS NULL OR _b <= 0 THEN RAISE EXCEPTION 'b must be > 0'; END IF;
  IF _i < 1 OR _i > array_length(_q, 1) THEN RAISE EXCEPTION 'index out of range'; END IF;

  SELECT MAX(v / _b) INTO _max FROM unnest(_q) v;
  FOREACH _x IN ARRAY _q LOOP
    _sum := _sum + exp((_x / _b) - _max);
  END LOOP;
  RETURN exp((_q[_i] / _b) - _max) / _sum;
END;
$$;

CREATE OR REPLACE FUNCTION public.lmsr_trade_cost(
  _q numeric[], _b numeric, _i int, _delta numeric
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _q2 numeric[];
BEGIN
  _q2 := _q;
  _q2[_i] := _q2[_i] + _delta;
  RETURN public.lmsr_cost(_q2, _b) - public.lmsr_cost(_q, _b);
END;
$$;

-- ============================================================
-- 4. Rate limiter helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(_fn text, _max int, _window_seconds int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*) INTO _count
    FROM public.rpc_call_log
    WHERE user_id = _uid AND fn = _fn
      AND called_at > now() - make_interval(secs => _window_seconds);
  IF _count >= _max THEN
    RAISE EXCEPTION 'Rate limit: too many % calls — wait a moment', _fn;
  END IF;
  INSERT INTO public.rpc_call_log (user_id, fn) VALUES (_uid, _fn);
END;
$$;

-- ============================================================
-- 5. simulate_lmsr_trade (read-only preview)
-- ============================================================

CREATE OR REPLACE FUNCTION public.simulate_lmsr_trade(
  _market_id uuid,
  _outcome text,           -- 'YES' | 'NO' | 'CANDIDATE'
  _outcome_id uuid,        -- required when 'CANDIDATE'
  _side text,              -- 'BUY' | 'SELL'
  _quantity int
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m RECORD;
  _q numeric[];
  _ids uuid[];
  _i int;
  _delta numeric;
  _cost numeric;
  _price_before numeric;
  _price_after numeric;
  _avg_price numeric;
  _slippage_bps numeric;
BEGIN
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;

  IF _m.market_type = 'binary' THEN
    IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome for binary market'; END IF;
    _q := ARRAY[_m.q_yes, _m.q_no]::numeric[];
    _i := CASE WHEN _outcome = 'YES' THEN 1 ELSE 2 END;
  ELSE
    IF _outcome_id IS NULL THEN RAISE EXCEPTION 'outcome_id required for multi market'; END IF;
    SELECT array_agg(q ORDER BY sort_order, created_at),
           array_agg(id ORDER BY sort_order, created_at)
      INTO _q, _ids
      FROM public.market_outcomes WHERE market_id = _market_id;
    _i := array_position(_ids, _outcome_id);
    IF _i IS NULL THEN RAISE EXCEPTION 'Outcome not in market'; END IF;
  END IF;

  _delta := CASE WHEN _side = 'BUY' THEN _quantity ELSE -_quantity END;
  _price_before := public.lmsr_price(_q, _m.liquidity_b, _i);
  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _q[_i] := _q[_i] + _delta;
  _price_after := public.lmsr_price(_q, _m.liquidity_b, _i);

  -- For BUY: cost > 0, user pays. avg_price = cost / qty.
  -- For SELL: cost < 0, user receives -cost. avg_price = -cost / qty.
  _avg_price := abs(_cost) / _quantity;
  _slippage_bps := CASE WHEN _price_before > 0
    THEN ((_avg_price - _price_before) / _price_before) * 10000 ELSE 0 END;

  RETURN jsonb_build_object(
    'cost_cents', round(_cost * 100)::bigint,
    'avg_price', _avg_price,
    'price_before', _price_before,
    'price_after', _price_after,
    'slippage_bps', round(_slippage_bps, 2)
  );
END;
$$;

-- ============================================================
-- 6. execute_lmsr_trade_binary
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(
  _market_id uuid,
  _outcome text,
  _side text,
  _quantity int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _q numeric[];
  _i int;
  _delta numeric;
  _cost numeric;
  _cost_cents bigint;
  _avg_price numeric;
  _balance bigint;
  _pos RECORD;
  _new_yes numeric;
  _new_no numeric;
  _new_shares int;
  _new_avg numeric;
  _trade_id uuid;
  _q_before numeric[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

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

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

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

  -- Apply state change
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

  UPDATE public.markets
    SET q_yes = _q[1],
        q_no = _q[2],
        yes_price = _new_yes,
        no_price = _new_no,
        volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _new_yes);
  INSERT INTO public.lmsr_state_log (market_id, q_before, q_after, b, cost_delta_cents, trade_id)
    VALUES (_market_id, _q_before, _q, _m.liquidity_b,
            CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END, _trade_id);

  RETURN jsonb_build_object(
    'ok', true,
    'cost_cents', _cost_cents,
    'avg_price', _avg_price,
    'new_yes_price', _new_yes,
    'trade_id', _trade_id
  );
END;
$$;

-- ============================================================
-- 7. execute_lmsr_trade_multi
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(
  _market_id uuid,
  _outcome_id uuid,
  _side text,
  _quantity int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _outcome RECORD;
  _q numeric[];
  _ids uuid[];
  _i int;
  _delta numeric;
  _cost numeric;
  _cost_cents bigint;
  _avg_price numeric;
  _balance bigint;
  _pos RECORD;
  _new_shares int;
  _new_avg numeric;
  _trade_id uuid;
  _q_before numeric[];
  _new_price numeric;
  _idx int;
  _row_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  PERFORM public.check_rate_limit('execute_lmsr_trade_multi', 30, 300);

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.market_type <> 'multi' THEN RAISE EXCEPTION 'Not a multi-outcome market'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  -- Lock all outcomes for this market
  PERFORM 1 FROM public.market_outcomes WHERE market_id = _market_id FOR UPDATE;

  SELECT array_agg(q ORDER BY sort_order, created_at),
         array_agg(id ORDER BY sort_order, created_at)
    INTO _q, _ids
    FROM public.market_outcomes WHERE market_id = _market_id;

  _i := array_position(_ids, _outcome_id);
  IF _i IS NULL THEN RAISE EXCEPTION 'Outcome not in market'; END IF;

  SELECT * INTO _outcome FROM public.market_outcomes WHERE id = _outcome_id;

  _q_before := _q;
  _delta := CASE WHEN _side = 'BUY' THEN _quantity ELSE -_quantity END;
  _cost := public.lmsr_trade_cost(_q, _m.liquidity_b, _i, _delta);
  _cost_cents := round(abs(_cost) * 100)::bigint;
  _avg_price := abs(_cost) / _quantity;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome_id = _outcome_id FOR UPDATE;

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
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ ' || round(_avg_price * 100) || 'c — ' || _m.question);

  -- Persist new q + recomputed prices for every outcome
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

  RETURN jsonb_build_object(
    'ok', true,
    'cost_cents', _cost_cents,
    'avg_price', _avg_price,
    'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
    'trade_id', _trade_id
  );
END;
$$;

-- ============================================================
-- 8. seed_lmsr_market — admin helper to set initial prob + b
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_lmsr_market(
  _market_id uuid,
  _initial_prob numeric,
  _b numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m RECORD;
  _logit numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can seed markets';
  END IF;
  IF _initial_prob <= 0 OR _initial_prob >= 1 THEN
    RAISE EXCEPTION 'initial_prob must be in (0, 1)';
  END IF;
  IF _b <= 0 THEN RAISE EXCEPTION 'b must be > 0'; END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;

  IF _m.market_type = 'binary' THEN
    -- q_yes - q_no = b * ln(p / (1-p)); set q_no=0
    _logit := _b * ln(_initial_prob / (1 - _initial_prob));
    UPDATE public.markets
      SET liquidity_b = _b,
          q_yes = _logit,
          q_no = 0,
          yes_price = _initial_prob,
          no_price = 1 - _initial_prob,
          initial_prob = _initial_prob,
          updated_at = now()
      WHERE id = _market_id;
  ELSE
    -- For multi: leave existing per-candidate prices, derive q_i = b * ln(p_i),
    -- centered so min q_i = 0.
    UPDATE public.markets SET liquidity_b = _b, initial_prob = _initial_prob, updated_at = now()
      WHERE id = _market_id;

    WITH base AS (
      SELECT id, _b * ln(GREATEST(price, 0.001)) AS raw_q FROM public.market_outcomes
        WHERE market_id = _market_id
    ),
    shifted AS (
      SELECT id, raw_q - (SELECT MIN(raw_q) FROM base) AS q_centered FROM base
    )
    UPDATE public.market_outcomes mo
      SET q = s.q_centered
      FROM shifted s
      WHERE mo.id = s.id;
  END IF;
END;
$$;

-- ============================================================
-- 9. rescale_liquidity — bump b without changing current price
-- ============================================================

CREATE OR REPLACE FUNCTION public.rescale_liquidity(_market_id uuid, _new_b numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m RECORD;
  _ratio numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can rescale liquidity';
  END IF;
  IF _new_b <= 0 THEN RAISE EXCEPTION 'b must be > 0'; END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;

  _ratio := _new_b / _m.liquidity_b;

  IF _m.market_type = 'binary' THEN
    UPDATE public.markets
      SET q_yes = q_yes * _ratio, q_no = q_no * _ratio,
          liquidity_b = _new_b, updated_at = now()
      WHERE id = _market_id;
  ELSE
    UPDATE public.market_outcomes SET q = q * _ratio WHERE market_id = _market_id;
    UPDATE public.markets SET liquidity_b = _new_b, updated_at = now() WHERE id = _market_id;
  END IF;
END;
$$;

-- ============================================================
-- 10. Backfill: seed q_yes/q_no for existing binary markets so
-- their LMSR price matches the current yes_price.
-- ============================================================

UPDATE public.markets
  SET q_yes = liquidity_b * ln(LEAST(0.99, GREATEST(0.01, yes_price)) /
                              (1 - LEAST(0.99, GREATEST(0.01, yes_price)))),
      q_no = 0
  WHERE market_type = 'binary' AND q_yes = 0 AND q_no = 0;

-- For existing multi markets, derive q from current price.
WITH base AS (
  SELECT id, market_id, GREATEST(price, 0.001) AS p FROM public.market_outcomes
),
b_lookup AS (
  SELECT b.id, m.liquidity_b, b.p FROM base b JOIN public.markets m ON m.id = b.market_id
),
mins AS (
  SELECT market_id, MIN(liquidity_b * ln(p)) AS minq
  FROM (SELECT mo.market_id, m.liquidity_b, GREATEST(mo.price, 0.001) AS p
        FROM public.market_outcomes mo JOIN public.markets m ON m.id = mo.market_id) x
  GROUP BY market_id
)
UPDATE public.market_outcomes mo
  SET q = (m.liquidity_b * ln(GREATEST(mo.price, 0.001))) - mins.minq
  FROM public.markets m, mins
  WHERE mo.market_id = m.id AND mins.market_id = mo.market_id AND mo.q = 0;
