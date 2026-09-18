
-- Fix: price is 0..1, KSh per share = price * 100, cents per share = price * 10000

CREATE OR REPLACE FUNCTION public.simulate_lmsr_trade(
  _market_id uuid, _outcome text, _outcome_id uuid, _side text, _quantity integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _m RECORD;
  _price_before numeric;
  _price_after numeric;
  _gross_cents bigint;
  _fee_cents bigint;
  _net_cents bigint;
  _avg_price numeric;
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _floor numeric := public.get_setting_numeric('price_floor', 0.05);
  _ceil  numeric := public.get_setting_numeric('price_ceiling', 0.95);
  _k     numeric := public.get_setting_numeric('linear_impact_k', 0.0008);
  _delta numeric;
BEGIN
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;

  IF _m.market_type = 'binary' THEN
    IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
    _price_before := CASE WHEN _outcome = 'YES' THEN _m.yes_price ELSE _m.no_price END;
  ELSE
    IF _outcome_id IS NULL THEN RAISE EXCEPTION 'outcome_id required'; END IF;
    SELECT price INTO _price_before FROM public.market_outcomes WHERE id = _outcome_id;
    IF _price_before IS NULL THEN RAISE EXCEPTION 'Outcome not found'; END IF;
  END IF;

  _delta := _k * _quantity;
  IF _side = 'BUY' THEN
    _price_after := LEAST(_ceil, _price_before + _delta);
  ELSE
    _price_after := GREATEST(_floor, _price_before - _delta);
  END IF;

  -- price (0..1) * 10000 = cents per share. e.g. 0.48 -> 4800 cents = Ksh 48.
  _gross_cents := round(_price_before * 10000 * _quantity)::bigint;
  IF _side = 'BUY' THEN
    _fee_cents := round(_gross_cents * _fee_bps / 10000.0)::bigint;
    _net_cents := _gross_cents + _fee_cents;
  ELSE
    _fee_cents := 0;
    _net_cents := _gross_cents;
  END IF;
  _avg_price := _price_before;

  RETURN jsonb_build_object(
    'cost_cents', _net_cents,
    'gross_cents', _gross_cents,
    'fee_cents', _fee_cents,
    'avg_price', _avg_price,
    'price_before', _price_before,
    'price_after', _price_after,
    'slippage_bps', 0,
    'max_payout_multiplier', round(1.0 / GREATEST(_floor, 0.001), 2),
    'fee_bps', _fee_bps
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(
  _market_id uuid, _outcome text, _side text, _quantity integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD;
  _price_before numeric;
  _price_after numeric;
  _gross_cents bigint; _fee_cents bigint; _cost_cents bigint;
  _avg_price numeric;
  _balance bigint; _pos RECORD;
  _new_shares int; _new_avg numeric;
  _trade_id uuid;
  _tier smallint; _status text;
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _floor numeric := public.get_setting_numeric('price_floor', 0.05);
  _ceil  numeric := public.get_setting_numeric('price_ceiling', 0.95);
  _k     numeric := public.get_setting_numeric('linear_impact_k', 0.0008);
  _delta numeric;
  _new_yes numeric; _new_no numeric;
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

  _price_before := CASE WHEN _outcome = 'YES' THEN _m.yes_price ELSE _m.no_price END;

  _gross_cents := round(_price_before * 10000 * _quantity)::bigint;
  IF _side = 'BUY' THEN
    _fee_cents := round(_gross_cents * _fee_bps / 10000.0)::bigint;
    _cost_cents := _gross_cents + _fee_cents;
  ELSE
    _fee_cents := 0;
    _cost_cents := _gross_cents;
  END IF;
  _avg_price := _price_before;

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

  _delta := _k * _quantity;
  IF _side = 'BUY' THEN
    _price_after := LEAST(_ceil, _price_before + _delta);
  ELSE
    _price_after := GREATEST(_floor, _price_before - _delta);
  END IF;

  IF _outcome = 'YES' THEN
    _new_yes := _price_after;
    _new_no  := GREATEST(_floor, LEAST(_ceil, 1 - _new_yes));
  ELSE
    _new_no  := _price_after;
    _new_yes := GREATEST(_floor, LEAST(_ceil, 1 - _new_no));
  END IF;

  INSERT INTO public.trades (user_id, market_id, outcome, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, _outcome, _side, _quantity, _avg_price, _cost_cents)
  RETURNING id INTO _trade_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome || ' @ KSh ' || round(_avg_price * 100) || ' — ' || _m.question);

  UPDATE public.markets
    SET yes_price = _new_yes, no_price = _new_no,
        volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _new_yes);

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'fee_cents', _fee_cents,
                            'avg_price', _avg_price, 'new_yes_price', _new_yes, 'trade_id', _trade_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(
  _market_id uuid, _outcome_id uuid, _side text, _quantity integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m RECORD; _outcome RECORD;
  _price_before numeric; _price_after numeric;
  _gross_cents bigint; _fee_cents bigint; _cost_cents bigint;
  _avg_price numeric;
  _balance bigint; _pos RECORD; _new_shares int; _new_avg numeric;
  _trade_id uuid;
  _tier smallint; _status text;
  _fee_bps int := public.get_setting_numeric('house_fee_bps', 300)::int;
  _floor numeric := public.get_setting_numeric('price_floor', 0.05);
  _ceil  numeric := public.get_setting_numeric('price_ceiling', 0.95);
  _k     numeric := public.get_setting_numeric('linear_impact_k', 0.0008);
  _delta numeric;
  _other_count int;
  _others_sum_old numeric;
  _others_target numeric;
  _scale numeric;
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

  SELECT * INTO _outcome FROM public.market_outcomes WHERE id = _outcome_id;
  IF NOT FOUND OR _outcome.market_id <> _market_id THEN RAISE EXCEPTION 'Outcome not in market'; END IF;
  _price_before := _outcome.price;

  _gross_cents := round(_price_before * 10000 * _quantity)::bigint;
  IF _side = 'BUY' THEN
    _fee_cents := round(_gross_cents * _fee_bps / 10000.0)::bigint;
    _cost_cents := _gross_cents + _fee_cents;
  ELSE
    _fee_cents := 0;
    _cost_cents := _gross_cents;
  END IF;
  _avg_price := _price_before;

  IF _side = 'BUY' THEN
    PERFORM public.assert_trade_caps(_uid, _market_id, _cost_cents);
  END IF;

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

  _delta := _k * _quantity;
  IF _side = 'BUY' THEN
    _price_after := LEAST(_ceil, _price_before + _delta);
  ELSE
    _price_after := GREATEST(_floor, _price_before - _delta);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(price), 0) INTO _other_count, _others_sum_old
    FROM public.market_outcomes
    WHERE market_id = _market_id AND id <> _outcome_id;

  _others_target := GREATEST(0, 1 - _price_after);
  IF _others_sum_old > 0 AND _other_count > 0 THEN
    _scale := _others_target / _others_sum_old;
    UPDATE public.market_outcomes
      SET price = GREATEST(_floor * 0.5, LEAST(_ceil, price * _scale))
      WHERE market_id = _market_id AND id <> _outcome_id;
  END IF;

  UPDATE public.market_outcomes SET price = _price_after WHERE id = _outcome_id;

  INSERT INTO public.outcome_price_history (market_id, outcome_id, price)
    SELECT market_id, id, price FROM public.market_outcomes WHERE market_id = _market_id;

  INSERT INTO public.trades (user_id, market_id, outcome, outcome_id, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _side, _quantity, _avg_price, _cost_cents)
  RETURNING id INTO _trade_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

  UPDATE public.markets
    SET volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  RETURN jsonb_build_object('ok', true, 'cost_cents', _cost_cents, 'fee_cents', _fee_cents,
                            'avg_price', _avg_price, 'new_price', _price_after, 'trade_id', _trade_id);
END;
$$;
