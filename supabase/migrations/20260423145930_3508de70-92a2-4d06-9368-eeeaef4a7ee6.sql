-- 1. source_health
CREATE TABLE IF NOT EXISTS public.source_health (
  source TEXT PRIMARY KEY,
  last_fetch_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  articles_24h INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.source_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Source health public read"
  ON public.source_health FOR SELECT
  USING (true);

CREATE POLICY "Admins write source health"
  ON public.source_health FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. trending_keywords
CREATE TABLE IF NOT EXISTS public.trending_keywords (
  keyword TEXT PRIMARY KEY,
  mentions_1h INTEGER NOT NULL DEFAULT 0,
  mentions_prev_1h INTEGER NOT NULL DEFAULT 0,
  growth NUMERIC NOT NULL DEFAULT 0,
  avg_sentiment NUMERIC NOT NULL DEFAULT 0,
  tweet_volume INTEGER,
  trend_score NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  sample_article_ids UUID[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_keywords_score ON public.trending_keywords (trend_score DESC);

ALTER TABLE public.trending_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trending keywords public read"
  ON public.trending_keywords FOR SELECT
  USING (true);

CREATE POLICY "Admins write trending keywords"
  ON public.trending_keywords FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. extend market_suggestions
ALTER TABLE public.market_suggestions
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trend_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS news_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tweet_volume INTEGER;

CREATE INDEX IF NOT EXISTS idx_market_suggestions_status ON public.market_suggestions (status, created_at DESC);
