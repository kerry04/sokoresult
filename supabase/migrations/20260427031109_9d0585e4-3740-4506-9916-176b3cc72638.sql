
-- 1. Market type column
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type text NOT NULL DEFAULT 'binary',
  ADD COLUMN IF NOT EXISTS resolved_outcome_id uuid;

-- 2. market_outcomes
CREATE TABLE IF NOT EXISTS public.market_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label text NOT NULL,
  slug text NOT NULL,
  image_url text,
  price numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_winner boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_market_outcomes_market ON public.market_outcomes(market_id);

ALTER TABLE public.market_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outcomes public read" ON public.market_outcomes
  FOR SELECT USING (true);

CREATE POLICY "Admins manage outcomes" ON public.market_outcomes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. outcome_price_history
CREATE TABLE IF NOT EXISTS public.outcome_price_history (
  id bigserial PRIMARY KEY,
  market_id uuid NOT NULL,
  outcome_id uuid NOT NULL REFERENCES public.market_outcomes(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oph_market_time ON public.outcome_price_history(market_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_oph_outcome_time ON public.outcome_price_history(outcome_id, recorded_at DESC);

ALTER TABLE public.outcome_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outcome price history public read" ON public.outcome_price_history
  FOR SELECT USING (true);

CREATE POLICY "Admins write outcome price history" ON public.outcome_price_history
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. outcome_id on positions/trades/orders
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS outcome_id uuid;
ALTER TABLE public.trades    ADD COLUMN IF NOT EXISTS outcome_id uuid;
ALTER TABLE public.orders    ADD COLUMN IF NOT EXISTS outcome_id uuid;

CREATE INDEX IF NOT EXISTS idx_positions_user_market_outcome
  ON public.positions(user_id, market_id, outcome_id);

-- 5. execute_multi_trade — buy shares in a specific candidate
CREATE OR REPLACE FUNCTION public.execute_multi_trade(
  _market_id uuid,
  _outcome_id uuid,
  _side text,
  _quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _market RECORD;
  _outcome RECORD;
  _other RECORD;
  _price numeric;
  _cost_cents bigint;
  _balance bigint;
  _pos RECORD;
  _k numeric := 0.0008;
  _new_price numeric;
  _delta numeric;
  _other_total numeric;
  _new_shares integer;
  _new_avg numeric;
  _realized_cents bigint := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT * INTO _market FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _market.market_type <> 'multi' THEN RAISE EXCEPTION 'Not a multi-outcome market'; END IF;
  IF _market.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  SELECT * INTO _outcome FROM public.market_outcomes
    WHERE id = _outcome_id AND market_id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outcome not found'; END IF;

  _price := _outcome.price;
  _cost_cents := ROUND(_quantity * _price * 100)::bigint;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome_id = _outcome_id FOR UPDATE;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now() WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, outcome_id, shares, avg_price)
      VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _quantity, _price);
    ELSE
      _new_shares := _pos.shares + _quantity;
      _new_avg := ((_pos.shares * _pos.avg_price) + (_quantity * _price)) / NULLIF(_new_shares,0);
      UPDATE public.positions SET shares = _new_shares, avg_price = _new_avg, updated_at = now() WHERE id = _pos.id;
    END IF;
  ELSE -- SELL
    IF _pos.id IS NULL OR _pos.shares < _quantity THEN
      RAISE EXCEPTION 'Insufficient shares to sell';
    END IF;
    UPDATE public.profiles SET kes_balance = kes_balance + _cost_cents, updated_at = now() WHERE id = _uid;
    _realized_cents := ROUND(_quantity * (_price - _pos.avg_price) * 100)::bigint;
    UPDATE public.positions SET shares = _pos.shares - _quantity, updated_at = now() WHERE id = _pos.id;
  END IF;

  INSERT INTO public.trades (user_id, market_id, outcome, outcome_id, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, 'CANDIDATE', _outcome_id, _side, _quantity, _price, _cost_cents);

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (
    _uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome.label || ' @ ' || ROUND(_price*100) || 'c — ' || _market.question
  );

  -- Price update: shift selected outcome by ±k*qty, redistribute opposite delta
  -- across other outcomes proportionally to their current price.
  IF _side = 'BUY' THEN
    _new_price := LEAST(0.98, GREATEST(0.01, _outcome.price + _k * _quantity));
  ELSE
    _new_price := LEAST(0.98, GREATEST(0.01, _outcome.price - _k * _quantity));
  END IF;
  _delta := _new_price - _outcome.price;

  UPDATE public.market_outcomes SET price = _new_price WHERE id = _outcome_id;

  -- Sum of other outcomes' prices
  SELECT COALESCE(SUM(price), 0) INTO _other_total
    FROM public.market_outcomes WHERE market_id = _market_id AND id <> _outcome_id;

  IF _other_total > 0 THEN
    -- Subtract delta from others proportionally, then re-clamp + normalize
    UPDATE public.market_outcomes
      SET price = GREATEST(0.01, LEAST(0.98, price - _delta * (price / _other_total)))
      WHERE market_id = _market_id AND id <> _outcome_id;
  END IF;

  -- Re-normalize so the sum is exactly 1.0
  PERFORM 1;
  WITH s AS (SELECT SUM(price) AS total FROM public.market_outcomes WHERE market_id = _market_id)
  UPDATE public.market_outcomes mo
    SET price = mo.price / s.total
    FROM s WHERE mo.market_id = _market_id AND s.total > 0;

  -- Snapshot all outcome prices
  INSERT INTO public.outcome_price_history (market_id, outcome_id, price)
  SELECT market_id, id, price FROM public.market_outcomes WHERE market_id = _market_id;

  UPDATE public.markets
    SET volume_cents = volume_cents + _cost_cents,
        trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = _market_id;

  RETURN jsonb_build_object(
    'ok', true, 'price', _price, 'cost_cents', _cost_cents,
    'new_price', (SELECT price FROM public.market_outcomes WHERE id = _outcome_id),
    'realized_cents', _realized_cents
  );
END;
$$;

-- 6. resolve_multi_market
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
  winner_label text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve markets';
  END IF;

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
    UPDATE public.profiles
      SET kes_balance = kes_balance + payout_cents, updated_at = now()
      WHERE id = pos.user_id;

    INSERT INTO public.transactions (user_id, type, amount_cents, description)
    VALUES (pos.user_id, 'payout', payout_cents,
      'Market resolved: ' || winner_label || ' won — ' || pos.shares || ' shares');
  END LOOP;
END;
$$;
