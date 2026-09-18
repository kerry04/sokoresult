-- De-Lovable cleanup: stop all pg_cron jobs that call the dead *.lovable.app
-- preview hosts. The hook routes themselves (src/routes/api/public/hooks/*)
-- remain — trigger them manually (admin panel / curl with CRON_SECRET) until
-- this app has a public host again, then schedule fresh jobs against the new
-- domain.

DO $$
DECLARE
  job record;
  jobs_dropped int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — nothing to unschedule.';
    RETURN;
  END IF;

  FOR job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE command ILIKE '%lovable.app%'
       OR command ILIKE '%lovableproject%'
       OR command ILIKE '%gpt-eng.com%'
  LOOP
    PERFORM cron.unschedule(job.jobid);
    jobs_dropped := jobs_dropped + 1;
    RAISE NOTICE 'Unscheduled cron job % (%)', job.jobname, job.jobid;
  END LOOP;

  RAISE NOTICE 'Dropped % Lovable cron job(s).', jobs_dropped;
END $$;
