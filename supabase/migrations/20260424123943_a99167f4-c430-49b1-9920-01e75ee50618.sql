
-- Drop unused social tables
DROP TABLE IF EXISTS public.reddit_posts CASCADE;
DROP TABLE IF EXISTS public.google_trends CASCADE;

-- Strip social columns from trending_keywords (news-only now)
ALTER TABLE public.trending_keywords
  DROP COLUMN IF EXISTS reddit_volume,
  DROP COLUMN IF EXISTS reddit_sentiment,
  DROP COLUMN IF EXISTS tweet_volume,
  DROP COLUMN IF EXISTS google_trends_score;

-- Add retry tracking to raw_news_data
ALTER TABLE public.raw_news_data
  ADD COLUMN IF NOT EXISTS analyze_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Backfill: reset poisoned rows (processed without any keywords) so they get re-analyzed
UPDATE public.raw_news_data
SET processed = false,
    analyze_attempts = 0,
    last_error = NULL
WHERE processed = true
  AND (relevant_keywords IS NULL OR array_length(relevant_keywords, 1) IS NULL);

-- Wipe stale trends so next compute starts clean
TRUNCATE public.trending_keywords;

-- Drop tweet_volume from market_suggestions (news-only)
ALTER TABLE public.market_suggestions
  DROP COLUMN IF EXISTS tweet_volume;
