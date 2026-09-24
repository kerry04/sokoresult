-- Notification preferences + price alerts.
--
-- NOT APPLIED YET. Staged for review; apply with explicit approval
-- (supabase db push). Until applied:
--   - GET/PUT /api/notifications/preferences returns 503 "not ready"
--   - /api/alerts returns 503 "not ready"
--   - the notifications page shows preferences as local-only placeholders
-- Nothing in this migration fabricates alerts: the check endpoint
-- (/api/alerts/check, guarded by CRON_SECRET) must still be scheduled
-- (pg_cron, needs separate approval) before alerts actually fire.

-- ---------- notification_preferences ----------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payouts boolean NOT NULL DEFAULT true,
  resolutions boolean NOT NULL DEFAULT true,
  trades boolean NOT NULL DEFAULT true,
  price_alerts boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs self read" ON public.notification_preferences;
CREATE POLICY "prefs self read" ON public.notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "prefs self write" ON public.notification_preferences;
CREATE POLICY "prefs self write" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "prefs self update" ON public.notification_preferences;
CREATE POLICY "prefs self update" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO service_role;
REVOKE ALL ON public.notification_preferences FROM public, anon;

-- ---------- price_alerts ----------
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('above', 'below')),
  threshold numeric NOT NULL CHECK (threshold > 0 AND threshold < 1),
  triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_alerts_one_active_per_market UNIQUE (user_id, market_id, direction, threshold)
);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts self read" ON public.price_alerts;
CREATE POLICY "alerts self read" ON public.price_alerts
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "alerts self insert" ON public.price_alerts;
CREATE POLICY "alerts self insert" ON public.price_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "alerts self delete" ON public.price_alerts;
CREATE POLICY "alerts self delete" ON public.price_alerts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS price_alerts_untriggered_idx
  ON public.price_alerts (triggered) WHERE triggered = false;

GRANT SELECT, INSERT, DELETE ON public.price_alerts TO authenticated;
GRANT SELECT, UPDATE ON public.price_alerts TO service_role;
REVOKE ALL ON public.price_alerts FROM public, anon;

-- Service role must be able to insert the notification rows the checker creates.
-- (notifications already has an "Admins manage" policy; the checker uses
-- service_role which bypasses RLS.)
