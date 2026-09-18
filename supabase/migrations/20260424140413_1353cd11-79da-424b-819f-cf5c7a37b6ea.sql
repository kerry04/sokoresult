-- Reset analysis backlog so the rebuilt analyzer can re-process articles
-- whose keywords were never extracted (or were rejected as junk).
UPDATE public.raw_news_data
SET analyze_attempts = 0,
    last_error = NULL,
    processed = false,
    relevant_keywords = NULL,
    entities = NULL,
    topics = NULL
WHERE published_at > now() - interval '48 hours'
  AND (
    processed = false
    OR relevant_keywords IS NULL
    OR cardinality(relevant_keywords) = 0
  );

-- Also wipe the existing junk trends so the next compute-trends run starts clean
DELETE FROM public.trending_keywords;