-- 1. Raise default liquidity_b
ALTER TABLE public.markets ALTER COLUMN liquidity_b SET DEFAULT 750;

-- 2. Auto-seed LMSR on market insert (binary uses yes_price; multi uses outcome prices)
CREATE OR REPLACE FUNCTION public.auto_seed_market_lmsr()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b numeric;
  _p numeric;
  _logit numeric;
BEGIN
  _b := COALESCE(NEW.liquidity_b, 750);
  IF _b <= 0 THEN _b := 750; END IF;
  NEW.liquidity_b := _b;

  IF NEW.market_type = 'binary' THEN
    _p := COALESCE(NEW.yes_price, 0.5);
    IF _p <= 0.001 THEN _p := 0.001; END IF;
    IF _p >= 0.999 THEN _p := 0.999; END IF;
    _logit := _b * ln(_p / (1 - _p));
    NEW.q_yes := _logit;
    NEW.q_no := 0;
    NEW.yes_price := _p;
    NEW.no_price := 1 - _p;
    NEW.initial_prob := _p;
  END IF;
  -- For multi: market_outcomes are inserted after the market row, so seeding
  -- happens via a separate AFTER INSERT trigger on market_outcomes (below).
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seed_market_lmsr ON public.markets;
CREATE TRIGGER trg_auto_seed_market_lmsr
BEFORE INSERT ON public.markets
FOR EACH ROW EXECUTE FUNCTION public.auto_seed_market_lmsr();

-- Seed multi-outcome q values from the initial price for each outcome row
CREATE OR REPLACE FUNCTION public.auto_seed_outcome_q()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b numeric;
  _p numeric;
BEGIN
  SELECT COALESCE(liquidity_b, 750) INTO _b FROM public.markets WHERE id = NEW.market_id;
  IF _b IS NULL OR _b <= 0 THEN _b := 750; END IF;
  _p := COALESCE(NEW.price, 0);
  IF _p <= 0.001 THEN _p := 0.001; END IF;
  -- q = b * ln(p). Centering happens implicitly because lmsr_price is invariant
  -- to a constant added to all q's.
  NEW.q := _b * ln(_p);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seed_outcome_q ON public.market_outcomes;
CREATE TRIGGER trg_auto_seed_outcome_q
BEFORE INSERT ON public.market_outcomes
FOR EACH ROW EXECUTE FUNCTION public.auto_seed_outcome_q();

-- 3. Position cap: max 20% of b shares per user per outcome
-- We enforce inside the LMSR trade RPCs by re-creating them with a guard.

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_binary(_market_id uuid, _outcome text, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _max_shares int;
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

  -- Position cap: 20% of liquidity_b shares per user per outcome
  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per outcome (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
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
    _side || ' ' || _quantity || ' ' || _outcome || ' @ ' || round(_avg_price * 100) || 'c — ' || _m.question);

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

  RETURN jsonb_build_object(
    'ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
    'new_yes_price', _new_yes, 'trade_id', _trade_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_lmsr_trade_multi(_market_id uuid, _outcome_id uuid, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _max_shares int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  PERFORM public.check_rate_limit('execute_lmsr_trade_multi', 30, 300);

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _m.market_type <> 'multi' THEN RAISE EXCEPTION 'Not a multi-outcome market'; END IF;
  IF _m.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

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

  _max_shares := GREATEST(10, floor(_m.liquidity_b * 0.20)::int);
  IF _side = 'BUY' THEN
    IF COALESCE(_pos.shares, 0) + _quantity > _max_shares THEN
      RAISE EXCEPTION 'Position cap reached: max % shares per candidate (currently % held)', _max_shares, COALESCE(_pos.shares, 0);
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
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ ' || round(_avg_price * 100) || 'c — ' || _m.question);

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
    'ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
    'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
    'trade_id', _trade_id
  );
END;
$function$;

-- 4. Admin: reset trader balance
CREATE OR REPLACE FUNCTION public.admin_reset_balance(_user_id uuid, _amount_cents bigint DEFAULT 1000000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old bigint;
  _delta bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reset balances';
  END IF;
  IF _amount_cents < 0 THEN RAISE EXCEPTION 'amount_cents must be >= 0'; END IF;

  SELECT kes_balance INTO _old FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  _delta := _amount_cents - _old;
  UPDATE public.profiles SET kes_balance = _amount_cents, updated_at = now() WHERE id = _user_id;

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (_user_id, 'admin_reset', _delta,
    'Admin balance reset to ' || (_amount_cents / 100) || ' KES');

  INSERT INTO public.audit_events (kind, user_id, payload)
  VALUES ('admin_reset_balance', _user_id,
    jsonb_build_object('admin', auth.uid(), 'old_cents', _old, 'new_cents', _amount_cents));

  RETURN jsonb_build_object('ok', true, 'old_cents', _old, 'new_cents', _amount_cents);
END;
$$;

-- 5. Retire old execute_trade / execute_multi_trade RPCs
DROP FUNCTION IF EXISTS public.execute_trade(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.execute_multi_trade(uuid, uuid, text, integer);

-- 6. Re-seed all open markets so initial_prob + new b take effect
-- Binary: derive from current yes_price; Multi: derive from current outcome prices.
DO $$
DECLARE
  m RECORD;
  _logit numeric;
  _b numeric := 750;
  _p numeric;
BEGIN
  FOR m IN SELECT * FROM public.markets WHERE status = 'open' LOOP
    IF m.market_type = 'binary' THEN
      _p := COALESCE(m.yes_price, 0.5);
      IF _p <= 0.001 THEN _p := 0.001; END IF;
      IF _p >= 0.999 THEN _p := 0.999; END IF;
      _logit := _b * ln(_p / (1 - _p));
      UPDATE public.markets
        SET liquidity_b = _b,
            q_yes = _logit, q_no = 0,
            yes_price = _p, no_price = 1 - _p,
            initial_prob = COALESCE(initial_prob, _p),
            updated_at = now()
        WHERE id = m.id;
    ELSE
      UPDATE public.markets SET liquidity_b = _b, initial_prob = COALESCE(initial_prob, 1.0/NULLIF((SELECT COUNT(*) FROM public.market_outcomes WHERE market_id = m.id),0)), updated_at = now() WHERE id = m.id;
      UPDATE public.market_outcomes
        SET q = _b * ln(GREATEST(price, 0.001))
        WHERE market_id = m.id;
    END IF;
  END LOOP;
END $$;