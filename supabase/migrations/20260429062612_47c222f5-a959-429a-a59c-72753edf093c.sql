-- =====================================================
-- ACHIEVEMENTS CATALOG
-- =====================================================
CREATE TABLE public.achievements (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  tier text NOT NULL DEFAULT 'bronze',
  category text NOT NULL,
  threshold int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements public read" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "Admins manage achievements" ON public.achievements FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- USER ACHIEVEMENTS
-- =====================================================
CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL,
  code text NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, code)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User achievements self read" ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "User achievements self update seen" ON public.user_achievements FOR UPDATE
  USING (auth.uid() = user_id);
CREATE INDEX idx_user_achievements_user ON public.user_achievements(user_id);

-- =====================================================
-- PROFILE ADDITIONS
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN current_streak int NOT NULL DEFAULT 0,
  ADD COLUMN longest_streak int NOT NULL DEFAULT 0,
  ADD COLUMN last_trade_date date,
  ADD COLUMN sound_enabled boolean NOT NULL DEFAULT true;

-- Allow these new columns through the guard trigger by relaxing it (system-only writes go via SECURITY DEFINER function)
-- Streak/last_trade_date are written ONLY by record_trade_engagement (security definer), which bypasses the guard via SET LOCAL.
-- sound_enabled is a user preference and may be updated by the user.
CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Allow internal SECURITY DEFINER calls (no auth.uid() context with elevated flag)
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Cannot change profile id'; END IF;
  IF NEW.kes_balance IS DISTINCT FROM OLD.kes_balance THEN RAISE EXCEPTION 'Balance can only be changed by the system'; END IF;
  IF NEW.oko_balance IS DISTINCT FROM OLD.oko_balance THEN RAISE EXCEPTION 'Balance can only be changed by the system'; END IF;
  IF NEW.kyc_tier IS DISTINCT FROM OLD.kyc_tier THEN RAISE EXCEPTION 'KYC tier can only be changed by the system'; END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN RAISE EXCEPTION 'Referral code is immutable'; END IF;
  IF NEW.current_streak IS DISTINCT FROM OLD.current_streak THEN RAISE EXCEPTION 'Streak managed by system'; END IF;
  IF NEW.longest_streak IS DISTINCT FROM OLD.longest_streak THEN RAISE EXCEPTION 'Streak managed by system'; END IF;
  IF NEW.last_trade_date IS DISTINCT FROM OLD.last_trade_date THEN RAISE EXCEPTION 'Streak managed by system'; END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications self read" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Notifications self update" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Admins manage notifications" ON public.notifications FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;

-- =====================================================
-- RECORD TRADE ENGAGEMENT
-- =====================================================
CREATE OR REPLACE FUNCTION public.record_trade_engagement(
  _market_id uuid,
  _category text,
  _seconds_on_page int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := CURRENT_DATE;
  _last_date date;
  _curr int;
  _longest int;
  _new_streak int;
  _milestone text;
  _new_unlocks text[] := ARRAY[]::text[];
  _vol bigint;
  _distinct_markets int;
  _cat_count int;
  _trade_count int;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  -- Bypass guard for our own writes
  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  SELECT last_trade_date, current_streak, longest_streak
    INTO _last_date, _curr, _longest
    FROM public.profiles WHERE id = _uid FOR UPDATE;

  IF _last_date IS NULL OR _last_date < _today - INTERVAL '1 day' THEN
    _new_streak := 1;
  ELSIF _last_date = _today - INTERVAL '1 day' THEN
    _new_streak := _curr + 1;
  ELSE
    _new_streak := _curr; -- already traded today
  END IF;

  UPDATE public.profiles
     SET current_streak = _new_streak,
         longest_streak = GREATEST(_longest, _new_streak),
         last_trade_date = _today,
         updated_at = now()
   WHERE id = _uid;

  -- Streak milestones
  IF _new_streak = 7 AND _curr < 7 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'streak_7') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'streak_7'; END IF;
  END IF;
  IF _new_streak = 30 AND _curr < 30 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'streak_30') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'streak_30'; END IF;
  END IF;
  IF _new_streak = 100 AND _curr < 100 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'streak_100') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'streak_100'; END IF;
  END IF;

  -- Trade count
  SELECT COUNT(*) INTO _trade_count FROM public.trades WHERE user_id = _uid;
  IF _trade_count = 1 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'first_trade') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'first_trade'; END IF;
  END IF;

  -- Volume tiers (lifetime trade volume in cents)
  SELECT COALESCE(SUM(cost_cents), 0) INTO _vol FROM public.trades WHERE user_id = _uid;
  IF _vol >= 1000000 THEN -- 10k KES
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'volume_bronze') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'volume_bronze'; END IF;
  END IF;
  IF _vol >= 10000000 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'volume_silver') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'volume_silver'; END IF;
  END IF;
  IF _vol >= 100000000 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'volume_gold') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'volume_gold'; END IF;
  END IF;
  IF _vol >= 1000000000 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'volume_platinum') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'volume_platinum'; END IF;
  END IF;

  -- Diversification
  SELECT COUNT(DISTINCT market_id) INTO _distinct_markets FROM public.trades WHERE user_id = _uid;
  IF _distinct_markets >= 10 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'explorer_10') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'explorer_10'; END IF;
  END IF;

  -- Category-specific
  IF _category IS NOT NULL THEN
    SELECT COUNT(*) INTO _cat_count
      FROM public.trades t JOIN public.markets m ON m.id = t.market_id
      WHERE t.user_id = _uid AND m.category::text = _category;
    IF _cat_count >= 5 THEN
      IF _category = 'politics' THEN
        INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'cat_politics') ON CONFLICT DO NOTHING;
        IF FOUND THEN _new_unlocks := _new_unlocks || 'cat_politics'; END IF;
      ELSIF _category = 'sports' THEN
        INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'cat_sports') ON CONFLICT DO NOTHING;
        IF FOUND THEN _new_unlocks := _new_unlocks || 'cat_sports'; END IF;
      ELSIF _category = 'economics' THEN
        INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'cat_crypto') ON CONFLICT DO NOTHING;
        IF FOUND THEN _new_unlocks := _new_unlocks || 'cat_crypto'; END IF;
      ELSIF _category = 'entertainment' THEN
        INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'cat_entertainment') ON CONFLICT DO NOTHING;
        IF FOUND THEN _new_unlocks := _new_unlocks || 'cat_entertainment'; END IF;
      END IF;
    END IF;
  END IF;

  -- Lightning round
  IF _seconds_on_page IS NOT NULL AND _seconds_on_page <= 30 THEN
    INSERT INTO public.user_achievements(user_id, code) VALUES (_uid, 'speed_lightning') ON CONFLICT DO NOTHING;
    IF FOUND THEN _new_unlocks := _new_unlocks || 'speed_lightning'; END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'off', true);

  _result := jsonb_build_object(
    'ok', true,
    'streak', jsonb_build_object('current', _new_streak, 'longest', GREATEST(_longest, _new_streak)),
    'newAchievements', to_jsonb(_new_unlocks),
    'volume_cents', _vol,
    'trade_count', _trade_count
  );
  RETURN _result;
END;
$$;

-- =====================================================
-- MARKET ACTIVITY (live FOMO data)
-- =====================================================
CREATE OR REPLACE FUNCTION public.market_activity(_market_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'traders_1h', (SELECT COUNT(DISTINCT user_id) FROM trades WHERE market_id = _market_id AND created_at > now() - interval '1 hour'),
    'trades_1h', (SELECT COUNT(*) FROM trades WHERE market_id = _market_id AND created_at > now() - interval '1 hour'),
    'volume_1h_cents', (SELECT COALESCE(SUM(cost_cents),0) FROM trades WHERE market_id = _market_id AND created_at > now() - interval '1 hour'),
    'buy_pressure_pct', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 50
                  ELSE ROUND(100.0 * SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) / COUNT(*))
             END
        FROM trades WHERE market_id = _market_id AND created_at > now() - interval '6 hours'
    )
  );
$$;

-- =====================================================
-- RISING STARS LEADERBOARD (24h pnl)
-- =====================================================
CREATE OR REPLACE FUNCTION public.leaderboard_rising_stars(_limit int DEFAULT 20)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, pnl_24h_cents bigint, trade_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.user_id,
         COALESCE(p.display_name, 'Anonymous') AS display_name,
         p.avatar_url,
         COALESCE(SUM(tx.amount_cents), 0)::bigint AS pnl_24h_cents,
         COUNT(DISTINCT t.id)::bigint AS trade_count
  FROM public.trades t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.transactions tx
    ON tx.user_id = t.user_id
   AND tx.type IN ('trade','payout')
   AND tx.created_at > now() - interval '24 hours'
  WHERE t.created_at > now() - interval '24 hours'
  GROUP BY t.user_id, p.display_name, p.avatar_url
  ORDER BY pnl_24h_cents DESC
  LIMIT LEAST(_limit, 100);
$$;

-- =====================================================
-- SEED ACHIEVEMENTS
-- =====================================================
INSERT INTO public.achievements (code, title, description, icon, tier, category, threshold) VALUES
  ('first_trade', 'First Steps', 'Made your very first trade', 'Sparkles', 'bronze', 'special', 1),
  ('streak_7', 'Week Warrior', '7-day trading streak', 'Flame', 'bronze', 'streak', 7),
  ('streak_30', 'Month Marathoner', '30-day trading streak', 'Flame', 'silver', 'streak', 30),
  ('streak_100', 'Centurion', '100-day trading streak', 'Flame', 'gold', 'streak', 100),
  ('volume_bronze', 'Bronze Trader', 'KSh 10,000 lifetime volume', 'Medal', 'bronze', 'volume', 1000000),
  ('volume_silver', 'Silver Trader', 'KSh 100,000 lifetime volume', 'Medal', 'silver', 'volume', 10000000),
  ('volume_gold', 'Gold Trader', 'KSh 1M lifetime volume', 'Medal', 'gold', 'volume', 100000000),
  ('volume_platinum', 'Platinum VIP', 'KSh 10M lifetime volume', 'Crown', 'platinum', 'volume', 1000000000),
  ('explorer_10', 'Diversification Master', 'Traded in 10 different markets', 'Compass', 'silver', 'explorer', 10),
  ('cat_politics', 'Politics Expert', '5 trades in Politics', 'Landmark', 'bronze', 'explorer', 5),
  ('cat_sports', 'Sports Pundit', '5 trades in Sports', 'Trophy', 'bronze', 'explorer', 5),
  ('cat_crypto', 'Economics Guru', '5 trades in Economics', 'TrendingUp', 'bronze', 'explorer', 5),
  ('cat_entertainment', 'Pop Culture Pro', '5 trades in Entertainment', 'Star', 'bronze', 'explorer', 5),
  ('speed_lightning', 'Lightning Round', 'Trade within 30 seconds of opening a market', 'Zap', 'gold', 'speed', 30)
ON CONFLICT (code) DO NOTHING;