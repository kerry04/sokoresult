-- 1. Add side column to trades
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'BUY';

-- 2. Backfill keywords on the existing 11 markets
UPDATE public.markets SET keywords = ARRAY['rigathi gachagua','gachagua','impeachment','court']
  WHERE slug = 'gachagua-impeachment-stands';
UPDATE public.markets SET keywords = ARRAY['harambee stars','afcon','afcon 2025','football kenya','fkf']
  WHERE slug = 'harambee-stars-afcon-2025';
UPDATE public.markets SET keywords = ARRAY['gor mahia','kpl','kenyan premier league','football kenya']
  WHERE slug = 'gor-mahia-kpl-title';
UPDATE public.markets SET keywords = ARRAY['gen z','gen-z','protests','nairobi','maandamano']
  WHERE slug = 'genz-protests-resume';
UPDATE public.markets SET keywords = ARRAY['shilling','kenyan shilling','kes','forex','exchange rate']
  WHERE slug = 'shilling-vs-usd-150';
UPDATE public.markets SET keywords = ARRAY['eliud kipchoge','kipchoge','marathon','retirement']
  WHERE slug = 'kipchoge-retirement';
UPDATE public.markets SET keywords = ARRAY['mpesa','m-pesa','safaricom','mobile money']
  WHERE slug = 'mpesa-100m-users';
UPDATE public.markets SET keywords = ARRAY['william ruto','ruto','re-election','2027 elections','kenya kwanza']
  WHERE slug = 'ruto-reelection-2027';
UPDATE public.markets SET keywords = ARRAY['bank fraud','dci','police','court','sh4.5bn']
  WHERE slug = 'will-the-summoned-police-detective-appear-in-court-for-the-s';
UPDATE public.markets SET keywords = ARRAY['lagos fashion week','fashion','nigeria','designers']
  WHERE slug = 'lagos-fashion-week-2026';
UPDATE public.markets SET keywords = ARRAY['nollywood','oscar','academy awards','nigerian film']
  WHERE slug = 'nollywood-oscar-nom';

-- 3. SQL helper: news matched to markets
CREATE OR REPLACE FUNCTION public.match_news_to_markets(_market_ids uuid[], _per_market int DEFAULT 6)
RETURNS TABLE (
  market_id uuid,
  article_id uuid,
  title text,
  url text,
  source text,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, n.id, n.title, n.url, n.source, n.published_at
  FROM public.markets m
  JOIN LATERAL (
    SELECT n.id, n.title, n.url, n.source, n.published_at
    FROM public.raw_news_data n
    WHERE n.processed = true
      AND n.relevant_keywords IS NOT NULL
      AND n.relevant_keywords && m.keywords
      AND n.published_at > now() - interval '7 days'
    ORDER BY n.published_at DESC
    LIMIT _per_market
  ) n ON true
  WHERE m.id = ANY(_market_ids)
    AND m.keywords IS NOT NULL
    AND array_length(m.keywords, 1) > 0;
$$;

-- 4. Update execute_trade to set side explicitly
CREATE OR REPLACE FUNCTION public.execute_trade(_market_id uuid, _outcome text, _side text, _quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _market RECORD;
  _price numeric;
  _cost_cents bigint;
  _balance bigint;
  _pos RECORD;
  _new_yes numeric;
  _net_yes_qty integer;
  _k numeric := 0.0008;
  _new_shares integer;
  _new_avg numeric;
  _realized_cents bigint := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be >= 1'; END IF;
  IF _outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF _side NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  SELECT * INTO _market FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF _market.status <> 'open' THEN RAISE EXCEPTION 'Market is not open'; END IF;

  _price := CASE WHEN _outcome = 'YES' THEN _market.yes_price ELSE _market.no_price END;
  _cost_cents := ROUND(_quantity * _price * 100)::bigint;

  SELECT * INTO _pos FROM public.positions
    WHERE user_id = _uid AND market_id = _market_id AND outcome = _outcome FOR UPDATE;

  IF _side = 'BUY' THEN
    SELECT kes_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF _balance < _cost_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

    UPDATE public.profiles SET kes_balance = kes_balance - _cost_cents, updated_at = now() WHERE id = _uid;

    IF _pos.id IS NULL THEN
      INSERT INTO public.positions (user_id, market_id, outcome, shares, avg_price)
      VALUES (_uid, _market_id, _outcome, _quantity, _price);
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

  INSERT INTO public.trades (user_id, market_id, outcome, side, quantity, price, cost_cents)
  VALUES (_uid, _market_id, _outcome, _side, _quantity, _price, _cost_cents);

  INSERT INTO public.transactions (user_id, type, amount_cents, description)
  VALUES (
    _uid, 'trade',
    CASE WHEN _side = 'BUY' THEN -_cost_cents ELSE _cost_cents END,
    _side || ' ' || _quantity || ' ' || _outcome || ' @ ' || ROUND(_price*100) || 'c — ' || _market.question
  );

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
    'ok', true, 'price', _price, 'cost_cents', _cost_cents,
    'new_yes_price', _new_yes, 'realized_cents', _realized_cents
  );
END;
$function$;

-- 5. Backfill trades.side from transactions (best effort: same user, same minute, +ve = SELL)
UPDATE public.trades t
SET side = 'SELL'
FROM public.transactions x
WHERE x.user_id = t.user_id
  AND x.type = 'trade'
  AND x.amount_cents > 0
  AND ABS(EXTRACT(EPOCH FROM (x.created_at - t.created_at))) < 2;

-- 6. Leaderboard function (aggregated, no balances)
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit int DEFAULT 50, _period text DEFAULT 'all')
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  trade_count bigint,
  volume_cents bigint,
  realized_pnl_cents bigint,
  unrealized_pnl_cents bigint,
  total_pnl_cents bigint,
  win_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cutoff AS (
    SELECT CASE _period
      WHEN '7d'  THEN now() - interval '7 days'
      WHEN '30d' THEN now() - interval '30 days'
      ELSE 'epoch'::timestamptz
    END AS ts
  ),
  trade_agg AS (
    SELECT t.user_id,
           COUNT(*)::bigint AS trade_count,
           COALESCE(SUM(t.cost_cents), 0)::bigint AS volume_cents
    FROM public.trades t, cutoff
    WHERE t.created_at >= cutoff.ts
    GROUP BY t.user_id
  ),
  realized AS (
    -- Realized = net of buys (negative) + sells (positive) for trade transactions
    SELECT x.user_id,
           COALESCE(SUM(x.amount_cents), 0)::bigint AS realized_pnl_cents
    FROM public.transactions x, cutoff
    WHERE x.type IN ('trade','payout')
      AND x.created_at >= cutoff.ts
    GROUP BY x.user_id
  ),
  unrealized AS (
    SELECT p.user_id,
           COALESCE(SUM(
             ROUND(p.shares * (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END - p.avg_price) * 100)
           ), 0)::bigint AS unrealized_pnl_cents
    FROM public.positions p
    JOIN public.markets m ON m.id = p.market_id
    WHERE p.shares > 0 AND m.status = 'open'
    GROUP BY p.user_id
  ),
  wins AS (
    SELECT p.user_id,
           SUM(CASE WHEN
             (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END) > p.avg_price
           THEN 1 ELSE 0 END)::numeric AS w,
           COUNT(*)::numeric AS n
    FROM public.positions p
    JOIN public.markets m ON m.id = p.market_id
    WHERE p.shares > 0
    GROUP BY p.user_id
  )
  SELECT
    pr.id,
    COALESCE(pr.display_name, 'Anonymous'),
    pr.avatar_url,
    COALESCE(ta.trade_count, 0),
    COALESCE(ta.volume_cents, 0),
    COALESCE(rl.realized_pnl_cents, 0),
    COALESCE(ur.unrealized_pnl_cents, 0),
    (COALESCE(rl.realized_pnl_cents, 0) + COALESCE(ur.unrealized_pnl_cents, 0))::bigint,
    CASE WHEN COALESCE(w.n, 0) > 0 THEN ROUND((w.w / w.n) * 100, 1) ELSE 0 END
  FROM public.profiles pr
  LEFT JOIN trade_agg ta ON ta.user_id = pr.id
  LEFT JOIN realized rl ON rl.user_id = pr.id
  LEFT JOIN unrealized ur ON ur.user_id = pr.id
  LEFT JOIN wins w ON w.user_id = pr.id
  WHERE COALESCE(ta.trade_count, 0) > 0
  ORDER BY (COALESCE(rl.realized_pnl_cents, 0) + COALESCE(ur.unrealized_pnl_cents, 0)) DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(int, text) TO anon, authenticated;

-- 7. Public per-user stats
CREATE OR REPLACE FUNCTION public.get_user_public_stats(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  member_since timestamptz,
  trade_count bigint,
  volume_cents bigint,
  realized_pnl_cents bigint,
  unrealized_pnl_cents bigint,
  total_pnl_cents bigint,
  win_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ta AS (
    SELECT COUNT(*)::bigint AS trade_count,
           COALESCE(SUM(cost_cents), 0)::bigint AS volume_cents
    FROM public.trades WHERE user_id = _user_id
  ),
  rl AS (
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS realized_pnl_cents
    FROM public.transactions WHERE user_id = _user_id AND type IN ('trade','payout')
  ),
  ur AS (
    SELECT COALESCE(SUM(
      ROUND(p.shares * (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END - p.avg_price) * 100)
    ), 0)::bigint AS unrealized_pnl_cents
    FROM public.positions p
    JOIN public.markets m ON m.id = p.market_id
    WHERE p.user_id = _user_id AND p.shares > 0 AND m.status = 'open'
  ),
  w AS (
    SELECT
      SUM(CASE WHEN (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END) > p.avg_price THEN 1 ELSE 0 END)::numeric AS w,
      COUNT(*)::numeric AS n
    FROM public.positions p
    JOIN public.markets m ON m.id = p.market_id
    WHERE p.user_id = _user_id AND p.shares > 0
  )
  SELECT
    pr.id,
    COALESCE(pr.display_name, 'Anonymous'),
    pr.avatar_url,
    pr.created_at,
    ta.trade_count,
    ta.volume_cents,
    rl.realized_pnl_cents,
    ur.unrealized_pnl_cents,
    (rl.realized_pnl_cents + ur.unrealized_pnl_cents)::bigint,
    CASE WHEN COALESCE(w.n, 0) > 0 THEN ROUND((w.w / w.n) * 100, 1) ELSE 0 END
  FROM public.profiles pr, ta, rl, ur, w
  WHERE pr.id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_stats(uuid) TO anon, authenticated;

-- 8. Public open positions for a user (no balance, no PII)
CREATE OR REPLACE FUNCTION public.get_user_public_positions(_user_id uuid)
RETURNS TABLE (
  market_id uuid,
  slug text,
  question text,
  category text,
  outcome text,
  shares int,
  avg_price numeric,
  current_price numeric,
  pnl_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.slug, m.question, m.category::text,
    p.outcome, p.shares, p.avg_price,
    (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END) AS current_price,
    CASE WHEN p.avg_price > 0
      THEN ROUND((((CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END) - p.avg_price) / p.avg_price) * 100, 2)
      ELSE 0 END AS pnl_pct
  FROM public.positions p
  JOIN public.markets m ON m.id = p.market_id
  WHERE p.user_id = _user_id AND p.shares > 0 AND m.status = 'open'
  ORDER BY (p.shares * (CASE p.outcome WHEN 'YES' THEN m.yes_price ELSE m.no_price END)) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_positions(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.match_news_to_markets(uuid[], int) TO anon, authenticated;