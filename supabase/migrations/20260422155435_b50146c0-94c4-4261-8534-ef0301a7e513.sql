-- =========================================================
-- 1. New tables: raw_news_data, market_suggestions
-- =========================================================
CREATE TABLE public.raw_news_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  body text,
  image_url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  sentiment_score numeric,
  entities jsonb,
  topics text[],
  relevant_keywords text[],
  category public.market_category,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, url)
);
CREATE INDEX idx_raw_news_published ON public.raw_news_data(published_at DESC);
CREATE INDEX idx_raw_news_processed ON public.raw_news_data(processed) WHERE processed = false;
CREATE INDEX idx_raw_news_keywords ON public.raw_news_data USING GIN (relevant_keywords);

ALTER TABLE public.raw_news_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "News public read" ON public.raw_news_data FOR SELECT USING (true);
CREATE POLICY "Admins write news" ON public.raw_news_data FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.market_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  suggested_question text NOT NULL,
  suggested_yes_price numeric NOT NULL CHECK (suggested_yes_price BETWEEN 0 AND 1),
  suggested_category public.market_category NOT NULL,
  suggested_close_at timestamptz,
  ai_reasoning text,
  source_article_ids uuid[],
  used_market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage suggestions" ON public.market_suggestions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 2. Allow users to insert/update their own positions (needed by execute_trade w/ SECURITY DEFINER not strictly,
--    but keep RLS clean for any direct read/refresh path)
-- =========================================================
-- Already: SELECT own positions. INSERT/UPDATE happens through SECURITY DEFINER fn.

-- =========================================================
-- 3. execute_trade(): atomic AMM trade
-- =========================================================
CREATE OR REPLACE FUNCTION public.execute_trade(
  _market_id uuid,
  _outcome text,        -- 'YES' | 'NO'
  _side text,           -- 'BUY' | 'SELL'
  _quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _market RECORD;
  _price numeric;
  _cost_cents bigint;
  _balance bigint;
  _pos RECORD;
  _new_yes numeric;
  _net_yes_qty integer;     -- signed: + buys YES / sells NO, - buys NO / sells YES
  _k numeric := 0.0008;     -- LMSR-lite slippage coefficient per share
  _new_shares integer;
  _new_avg numeric;
  _realized_cents bigint := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be >= 1';
  END IF;
  IF _outcome NOT IN ('YES','NO') THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;
  IF _side NOT IN ('BUY','SELL') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;

  SELECT * INTO _market FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _market.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  _price := CASE WHEN _outcome = 'YES' THEN _market.yes_price ELSE _market.no_price END;
  _cost_cents := ROUND(_quantity * _price * 100)::bigint;

  -- Position lookup
  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now()
      WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, shares, avg_price)
      VALUES (_uid, _market_id, _outcome, _quantity, _price);
    ELSE
      _new_shares := _pos.shares + _quantity;
      _new_avg := ((_pos.shares * _pos.avg_price) + (_quantity * _price)) / NULLIF(_new_shares,0);
      UPDATE public.positions SET shares = _new_shares, avg_price = _new_avg, updated_at = now()
        WHERE id = _pos.id;
    END IF;

  ELSE -- SELL
    IF _pos.id IS NULL OR _pos.shares < _quantity THEN
      RAISE EXCEPTION 'Insufficient shares to sell';
    END IF;
    UPDATE public.profiles SET kes_balance = kes_balance + _cost_cents, updated_at = now()
      WHERE id = _uid;
    _realized_cents := ROUND(_quantity * (_price - _pos.avg_price) * 100)::bigint;
    UPDATE public.positions SET shares = _pos.shares - _quantity, updated_at = now()
      WHERE id = _pos.id;
  END IF;

  -- Trade + transaction records
  INSERT INTO public.trades (user_id, market_id, outcome, quantity, price, cost_cents)
  VALUES (_uid, _market_id, _outcome, _quantity, _price, _cost_cents);

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (
    _uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome || ' @ ' || ROUND(_price*100) || 'c — ' || _market.question
  );

  -- AMM price update (LMSR-lite)
  -- Net YES demand: BUY YES (+), SELL YES (-), BUY NO (-), SELL NO (+)
  _net_yes_qty := CASE
    WHEN _outcome = 'YES' AND _side = 'BUY'  THEN  _quantity
    WHEN _outcome = 'YES' AND _side = 'SELL' THEN -_quantity
    WHEN _outcome = 'NO'  AND _side = 'BUY'  THEN -_quantity
    WHEN _outcome = 'NO'  AND _side = 'SELL' THEN  _quantity
  END;
  _new_yes := LEAST(0.98, GREATEST(0.02, _market.yes_price + _k * _net_yes_qty));

  UPDATE public.markets
  SET yes_price = _new_yes,
      no_price = 1 - _new_yes,
      volume_cents = volume_cents + _cost_cents,
      trader_count = trader_count + CASE WHEN _pos.id IS NULL AND _side = 'BUY' THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE id = _market_id;

  INSERT INTO public.price_history (market_id, yes_price) VALUES (_market_id, _new_yes);

  RETURN jsonb_build_object(
    'ok', true,
    'price', _price,
    'cost_cents', _cost_cents,
    'new_yes_price', _new_yes,
    'realized_cents', _realized_cents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, text, text, integer) TO authenticated;

-- =========================================================
-- 4. Auto-resolve flag on markets (admin can opt-in per market)
-- =========================================================
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS auto_resolve_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_resolution jsonb;  -- AI recommendation cache

-- =========================================================
-- 5. Extensions for cron + http
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;