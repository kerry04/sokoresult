-- Enable scheduling + outbound HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing jobs if they exist (idempotent)
DO $$
DECLARE
  job_name text;
BEGIN
  FOREACH job_name IN ARRAY ARRAY['sokoresult-scrape-news','sokoresult-analyze-sentiment','sokoresult-auto-resolve']
  LOOP
    PERFORM cron.unschedule(job_name) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name);
  END LOOP;
END $$;

-- Scrape every 15 minutes
SELECT cron.schedule(
  'sokoresult-scrape-news',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app/api/public/hooks/scrape-news',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Analyze sentiment every 30 minutes
SELECT cron.schedule(
  'sokoresult-analyze-sentiment',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app/api/public/hooks/analyze-sentiment',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Auto-resolve hourly
SELECT cron.schedule(
  'sokoresult-auto-resolve',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app/api/public/hooks/auto-resolve',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);