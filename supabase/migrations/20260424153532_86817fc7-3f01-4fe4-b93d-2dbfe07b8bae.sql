-- 1. sentiment column on social posts (nullable)
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS sentiment numeric;

-- 2. unschedule dead crons (safe if already gone)
DO $$
BEGIN
  PERFORM cron.unschedule('scrape-reddit-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('scrape-google-trends-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. unschedule existing tweet cron if present, then re-add (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('scrape-tweets-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scrape-tweets-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app/api/public/hooks/scrape-tweets',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 4. delete dead source_health rows
DELETE FROM public.source_health WHERE source IN ('reddit', 'google_trends');

-- 5. reset stuck articles so the new larger batch can clear backlog
UPDATE public.raw_news_data
   SET analyze_attempts = 0,
       last_error = NULL
 WHERE processed = false
   AND analyze_attempts > 0
   AND created_at > now() - interval '48 hours';