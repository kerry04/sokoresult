-- Model-signal time series for the honest AI-vs-market chart.
--
-- NOT APPLIED YET. Staged for review; apply with explicit approval
-- (supabase db push). Creates no behavior on its own.
--
-- Why: market_signals holds only the CURRENT model estimate per market, so a
-- chart drawn from it alone would have to invent historical model points. This
-- table snapshots every compute_market_signal() run, giving the frontend a
-- real two-line history: crowd price (price_history) vs Soko model
-- (market_signal_history). Until the migration is applied, the chart falls
-- back to a dashed "model now" line against real market history.

CREATE TABLE IF NOT EXISTS public.market_signal_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  signal_prob NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  news_count INT NOT NULL DEFAULT 0,
  social_count INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_signal_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.market_signal_history TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.market_signal_history TO service_role;
REVOKE ALL ON public.market_signal_history FROM public;

DROP POLICY IF EXISTS "signal history public read" ON public.market_signal_history;
CREATE POLICY "signal history public read"
  ON public.market_signal_history FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS market_signal_history_market_time_idx
  ON public.market_signal_history (market_id, computed_at);

-- Snapshot every signal computation. Appends to compute_market_signal so the
-- current-estimate upsert keeps working exactly as before.
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
  -- Append-only history snapshot for the AI-vs-market chart.
  INSERT INTO public.market_signal_history(market_id, signal_prob, confidence, news_count, social_count)
  VALUES (_market_id, _signal, _conf, _news_count, _social_count);
  -- Keep the table lean: 90 days per market is plenty for charting.
  DELETE FROM public.market_signal_history
   WHERE market_id = _market_id AND computed_at < now() - interval '90 days';
  RETURN jsonb_build_object('ok', true, 'signal_prob', _signal, 'confidence', _conf);
END $$;
