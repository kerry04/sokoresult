SELECT cron.unschedule('sokoresult-analyze-sentiment');
SELECT cron.schedule(
  'sokoresult-analyze-sentiment',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app/api/public/hooks/analyze-sentiment',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
UPDATE public.raw_news_data
   SET analyze_attempts = 0, last_error = NULL
 WHERE processed = false
   AND last_error ILIKE '%rate limit%';