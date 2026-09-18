
-- ============== Profile additions ==============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS last_seen_ip inet;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('active','flagged','restricted','suspended'));
  END IF;
END $$;

-- Allow user to update country (existing guard trigger does not block it).
-- No change needed there.

-- ============== Admin alerts table ==============
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  user_id uuid,
  market_id uuid,
  trade_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read alerts" ON public.admin_alerts;
CREATE POLICY "Admins read alerts" ON public.admin_alerts
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update alerts" ON public.admin_alerts;
CREATE POLICY "Admins update alerts" ON public.admin_alerts
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON public.admin_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_open ON public.admin_alerts (acknowledged, created_at DESC);

-- ============== Trade alert trigger ==============
CREATE OR REPLACE FUNCTION public.trade_alert_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent int;
  _prev_price numeric;
  _curr_price numeric;
  _prev_time timestamptz;
BEGIN
  -- Large trade: cost > KSh 500 (50_000 cents)
  IF NEW.cost_cents > 50000 THEN
    INSERT INTO public.admin_alerts (kind, severity, user_id, market_id, trade_id, payload)
    VALUES ('large_trade', 'warn', NEW.user_id, NEW.market_id, NEW.id,
      jsonb_build_object('cost_cents', NEW.cost_cents, 'quantity', NEW.quantity, 'side', NEW.side));
  END IF;

  -- Rapid trading: > 10 trades by this user in last 60s
  SELECT COUNT(*) INTO _recent FROM public.trades
    WHERE user_id = NEW.user_id AND created_at > now() - interval '60 seconds';
  IF _recent > 10 THEN
    INSERT INTO public.admin_alerts (kind, severity, user_id, market_id, trade_id, payload)
    VALUES ('rapid_trading', 'warn', NEW.user_id, NEW.market_id, NEW.id,
      jsonb_build_object('trades_last_60s', _recent));
  END IF;

  -- Price shift: change > 0.15 in last 5 min on this market (binary only)
  SELECT yes_price, recorded_at INTO _prev_price, _prev_time
    FROM public.price_history
    WHERE market_id = NEW.market_id
      AND recorded_at < now() - interval '10 seconds'
    ORDER BY recorded_at DESC LIMIT 1;
  SELECT yes_price INTO _curr_price FROM public.price_history
    WHERE market_id = NEW.market_id ORDER BY recorded_at DESC LIMIT 1;
  IF _prev_price IS NOT NULL AND _curr_price IS NOT NULL
     AND _prev_time > now() - interval '5 minutes'
     AND abs(_curr_price - _prev_price) > 0.15 THEN
    INSERT INTO public.admin_alerts (kind, severity, market_id, trade_id, payload)
    VALUES ('price_shift', 'critical', NEW.market_id, NEW.id,
      jsonb_build_object('from', _prev_price, 'to', _curr_price));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trade_alert_check ON public.trades;
CREATE TRIGGER trg_trade_alert_check
  AFTER INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.trade_alert_check();

-- ============== Block restricted/suspended from trading ==============
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
  _tier smallint;
  _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier, status INTO _tier, _status FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN
    RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade';
  END IF;
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

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

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
    _side || ' ' || _quantity || ' ' || _outcome || ' @ KSh ' || round(_avg_price * 100, 2) || ' — ' || _m.question);

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

-- Same restriction in multi
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
  _tier smallint;
  _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT kyc_tier, status INTO _tier, _status FROM public.profiles WHERE id = _uid;
  IF COALESCE(_tier, 0) < 1 THEN
    RAISE EXCEPTION 'KYC_REQUIRED: Verification required to trade';
  END IF;
  IF _status IN ('restricted','suspended') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Your account is % — contact support', _status;
  END IF;

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

  RETURN jsonb_build_object(
    'ok', true, 'cost_cents', _cost_cents, 'avg_price', _avg_price,
    'new_price', public.lmsr_price(_q, _m.liquidity_b, _i),
    'trade_id', _trade_id
  );
END;
$function$;

-- ============== Admin RPCs ==============

CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'active_users_24h', (SELECT count(DISTINCT user_id) FROM public.trades WHERE created_at > now() - interval '24 hours'),
    'trades_24h', (SELECT count(*) FROM public.trades WHERE created_at > now() - interval '24 hours'),
    'volume_24h_cents', (SELECT COALESCE(SUM(cost_cents),0) FROM public.trades WHERE created_at > now() - interval '24 hours'),
    'total_liquidity_kes', (SELECT COALESCE(SUM(liquidity_b * 10), 0) FROM public.markets WHERE status = 'open'),
    'active_markets', (SELECT count(*) FROM public.markets WHERE status = 'open'),
    'open_alerts', (SELECT count(*) FROM public.admin_alerts WHERE NOT acknowledged),
    'open_tickets', (SELECT count(*) FROM public.support_tickets WHERE status IN ('open','in_progress'))
  ) INTO _r;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.admin_pause_market(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.markets SET status = 'paused', updated_at = now() WHERE id = _id AND status = 'open';
  INSERT INTO public.audit_events (kind, market_id, user_id, payload)
    VALUES ('market_paused', _id, auth.uid(), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_resume_market(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.markets SET status = 'open', updated_at = now() WHERE id = _id AND status = 'paused';
  INSERT INTO public.audit_events (kind, market_id, user_id, payload)
    VALUES ('market_resumed', _id, auth.uid(), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_status(_user_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('active','flagged','restricted','suspended') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.profiles SET status = _status, flag_reason = _reason, updated_at = now()
    WHERE id = _user_id;
  INSERT INTO public.audit_events (kind, user_id, payload)
    VALUES ('user_status_change', _user_id,
      jsonb_build_object('admin', auth.uid(), 'new_status', _status, 'reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_user_stats(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'trade_count', (SELECT count(*) FROM public.trades WHERE user_id = _user_id),
    'volume_cents', (SELECT COALESCE(SUM(cost_cents),0) FROM public.trades WHERE user_id = _user_id),
    'avg_trade_cents', (SELECT COALESCE(AVG(cost_cents),0)::bigint FROM public.trades WHERE user_id = _user_id),
    'realized_pnl_cents', (SELECT COALESCE(SUM(amount_cents),0) FROM public.transactions
                            WHERE user_id = _user_id AND type IN ('trade','payout')),
    'win_rate', (
      SELECT CASE WHEN count(*) > 0
        THEN round(100.0 * sum(CASE WHEN
          (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END) > p.avg_price
        THEN 1 ELSE 0 END) / count(*), 1) ELSE 0 END
      FROM public.positions p JOIN public.markets m ON m.id = p.market_id
      WHERE p.user_id = _user_id AND p.shares > 0)
  ) INTO _r;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.admin_recent_trades(
  _limit int DEFAULT 100,
  _user_id uuid DEFAULT NULL,
  _market_id uuid DEFAULT NULL,
  _min_cents bigint DEFAULT 0
)
RETURNS TABLE(
  id uuid, created_at timestamptz, user_id uuid, display_name text,
  market_id uuid, question text, outcome text, side text,
  quantity int, price numeric, cost_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.created_at, t.user_id, p.display_name,
         t.market_id, m.question, t.outcome, t.side,
         t.quantity, t.price, t.cost_cents
  FROM public.trades t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.markets m ON m.id = t.market_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_user_id IS NULL OR t.user_id = _user_id)
    AND (_market_id IS NULL OR t.market_id = _market_id)
    AND t.cost_cents >= _min_cents
  ORDER BY t.created_at DESC
  LIMIT LEAST(_limit, 500);
$$;

CREATE OR REPLACE FUNCTION public.admin_detect_syndicates(_window_minutes int DEFAULT 60)
RETURNS TABLE(
  cluster_key text, market_id uuid, question text, outcome text,
  user_count int, total_quantity bigint, total_cost_cents bigint,
  user_ids uuid[], display_names text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT t.market_id, m.question, t.outcome,
           t.user_id, p.display_name, t.quantity, t.cost_cents
    FROM public.trades t
    JOIN public.markets m ON m.id = t.market_id
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE public.has_role(auth.uid(), 'admin')
      AND t.created_at > now() - make_interval(mins => _window_minutes)
      AND t.side = 'BUY'
  )
  SELECT (market_id::text || ':' || outcome) AS cluster_key,
         market_id, max(question) AS question, outcome,
         count(DISTINCT user_id)::int AS user_count,
         sum(quantity)::bigint AS total_quantity,
         sum(cost_cents)::bigint AS total_cost_cents,
         array_agg(DISTINCT user_id) AS user_ids,
         array_agg(DISTINCT display_name) AS display_names
  FROM base
  GROUP BY market_id, outcome
  HAVING count(DISTINCT user_id) >= 3
  ORDER BY user_count DESC, total_cost_cents DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.admin_acknowledge_alert(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.admin_alerts
    SET acknowledged = true, acknowledged_by = auth.uid(), acknowledged_at = now()
    WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_liquidity(_market_id uuid, _new_b numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.rescale_liquidity(_market_id, _new_b);
  INSERT INTO public.audit_events (kind, market_id, user_id, payload)
    VALUES ('liquidity_adjusted', _market_id, auth.uid(),
      jsonb_build_object('new_b', _new_b));
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_overview_stats() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_pause_market(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resume_market(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_stats(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_recent_trades(int, uuid, uuid, bigint) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_detect_syndicates(int) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_acknowledge_alert(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_liquidity(uuid, numeric) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pause_market(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_market(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_trades(int, uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_detect_syndicates(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_acknowledge_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_liquidity(uuid, numeric) TO authenticated;

-- Realtime for alerts + trades feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;
