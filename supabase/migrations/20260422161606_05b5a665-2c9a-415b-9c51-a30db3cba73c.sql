SELECT cron.unschedule('sokoresult-scrape-news') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-scrape-news');
SELECT cron.unschedule('sokoresult-analyze-sentiment') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-analyze-sentiment');
SELECT cron.unschedule('sokoresult-auto-resolve') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sokoresult-auto-resolve');

SELECT cron.schedule('sokoresult-scrape-news', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6-dev.lovable.app/api/public/hooks/scrape-news',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

SELECT cron.schedule('sokoresult-analyze-sentiment', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6-dev.lovable.app/api/public/hooks/analyze-sentiment',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

SELECT cron.schedule('sokoresult-auto-resolve', '0 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6-dev.lovable.app/api/public/hooks/auto-resolve',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);