-- 1) Settings
INSERT INTO public.system_settings(key, value) VALUES
  ('house_fee_bps', to_jsonb(300)),
  ('max_payout_multiplier', to_jsonb(20)),
  ('hourly_volume_cap_cents', to_jsonb(50000000)),
  ('notional_cap_pct_of_b', to_jsonb(0.60)),
  ('multi_share_cap_pct_of_b', to_jsonb(0.50))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 2) simulate_lmsr_trade — include house fee on BUY, expose max_multiplier
CREATE OR REPLACE FUNCTION public.simulate_lmsr_trade(_market_id uuid, _outcome text, _outcome_id uuid, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _m RECORD;
  _q numeric[];
  _ids uuid[];
  _i int;
  _delta numeric;
  _cost numeric;
  _gross_cents bigint;
  _fee_cents bigint;
  _net_cents bigint;
  _price_before numeric;
  _price_after numeric;
  _avg_price numeric;
  _slippage_bps numeric;
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _max_mult numeric := public.get_setting_numeric('max_payout_multiplier', 20);
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

  _gross_cents := round(abs(_cost) * 100)::bigint;
  IF _side = 'BUY' THEN
    _fee_cents := round(_gross_cents * _fee_bps / 10000.0)::bigint;
    _net_cents := _gross_cents + _fee_cents;
  ELSE
    _fee_cents := 0;
    _net_cents := _gross_cents;
  END IF;
  _avg_price := _net_cents::numeric / 100.0 / _quantity;
  _slippage_bps := CASE WHEN _price_before > 0
    THEN ((_avg_price - _price_before) / _price_before) * 10000 ELSE 0 END;

  RETURN jsonb_build_object(
    'cost_cents', _net_cents,
    'gross_cents', _gross_cents,
    'fee_cents', _fee_cents,
    'avg_price', _avg_price,
    'price_before', _price_before,
    'price_after', _price_after,
    'slippage_bps', round(_slippage_bps, 2),
    'max_payout_multiplier', _max_mult,
    'fee_bps', _fee_bps
  );
END;
$function$;

-- 3) execute_lmsr_trade_binary — apply fee + longshot cap
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

  -- Longshot cap: refuse BUY if implied payout > max_mult
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

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

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

-- 4) execute_lmsr_trade_multi — apply fee + longshot cap, raise share cap
CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(_market_id uuid, _outcome_id uuid, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD; _outcome RECORD; _q numeric[]; _ids uuid[];
  _i int; _delta numeric;
  _cost numeric; _gross_cents bigint; _fee_cents bigint; _cost_cents bigint;
  _avg_price numeric;
  _balance bigint; _pos RECORD; _new_shares int; _new_avg numeric;
  _trade_id uuid; _q_before numeric[]; _new_price numeric;
  _idx int; _row_id uuid; _max_shares int; _tier smallint; _status text;
  _notional_cap_cents bigint;
  _notional_pct numeric := public.get_setting_numeric('notional_cap_pct_of_b', 0.60);
  _share_pct numeric := public.get_setting_numeric('multi_share_cap_pct_of_b', 0.50);
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _max_mult numeric := public.get_setting_numeric('max_payout_multiplier', 20);
  _price_before numeric;
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

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome_id = _outcome_id FOR UPDATE;

  _max_shares := GREATEST(10, floor(_m.liquidity_b * _share_pct)::int);
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

  IF _fee_cents > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (_uid, 'fee', 0, 'House fee ' || (_fee_bps::numeric/100) || '% — KSh ' || round(_fee_cents/100.0, 2));
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'fee_cents', _fee_cents,
                            'avg_price', _avg_price,
                            'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
                            'trade_id', _trade_id);
END;
$function$;