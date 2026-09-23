-- Repoint pg_cron jobs from the dead lovable.app URLs to the Vercel deployment.
-- Idempotent. Secrets live in a private table (custom DB params need superuser).
-- The value below is replaced with the real CRON_SECRET by the deploy script
-- before `supabase db push` runs; if you run this manually in SQL Editor,
-- paste your CRON_SECRET over <your CRON_SECRET> first.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.cron_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

DELETE FROM private.cron_config WHERE key = 'cron_secret';
INSERT INTO private.cron_config(key, value) VALUES ('cron_secret', 'SET_YOUR_CRON_SECRET_HERE');

REVOKE ALL ON private.cron_config FROM anon, authenticated;

-- 1. scrape-news every 20 minutes
SELECT cron.unschedule('sokoresult-scrape-news')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-scrape-news');

SELECT cron.schedule(
  'sokoresult-scrape-news',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sokoresult.vercel.app/api/public/hooks/scrape-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private.cron_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. analyze-sentiment every 10 minutes
SELECT cron.unschedule('sokoresult-analyze-sentiment')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-analyze-sentiment');

SELECT cron.schedule(
  'sokoresult-analyze-sentiment',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sokoresult.vercel.app/api/public/hooks/analyze-sentiment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private.cron_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. auto-resolve every hour
SELECT cron.unschedule('sokoresult-auto-resolve')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-auto-resolve');

SELECT cron.schedule(
  'sokoresult-auto-resolve',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sokoresult.vercel.app/api/public/hooks/auto-resolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private.cron_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. compute-trends every 30 minutes
SELECT cron.unschedule('sokoresult-compute-trends')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-compute-trends');

SELECT cron.schedule(
  'sokoresult-compute-trends',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sokoresult.vercel.app/api/public/hooks/compute-trends',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private.cron_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
