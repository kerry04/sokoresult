-- Backfill columns that compute-trends upserts but were never applied to live.
-- The production hook writes velocity / lifecycle / confidence into
-- trending_keywords; without these the cron crashes with PGRST204.
ALTER TABLE public.trending_keywords
  ADD COLUMN IF NOT EXISTS velocity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'emerging',
  ADD COLUMN IF NOT EXISTS confidence numeric NOT NULL DEFAULT 0;
