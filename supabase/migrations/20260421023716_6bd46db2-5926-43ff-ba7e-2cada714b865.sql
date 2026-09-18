
-- =========================================
-- SokoResult Phase 1 Schema
-- =========================================

-- Enums
CREATE TYPE public.market_category AS ENUM ('politics', 'sports', 'entertainment', 'fashion', 'economics');
CREATE TYPE public.market_status AS ENUM ('open', 'closed', 'resolved');
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- =========================================
-- profiles
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  kes_balance BIGINT NOT NULL DEFAULT 1000000, -- cents = KES 10,000
  oko_balance BIGINT NOT NULL DEFAULT 0,
  kyc_tier SMALLINT NOT NULL DEFAULT 0,
  phone TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =========================================
-- user_roles
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Roles viewable by self" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================
-- markets
-- =========================================
CREATE TABLE public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  category market_category NOT NULL,
  status market_status NOT NULL DEFAULT 'open',
  yes_price NUMERIC(5,4) NOT NULL DEFAULT 0.5, -- 0..1
  no_price NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  volume_cents BIGINT NOT NULL DEFAULT 0,
  trader_count INTEGER NOT NULL DEFAULT 0,
  closes_at TIMESTAMPTZ,
  resolved_outcome BOOLEAN,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Markets public read" ON public.markets
  FOR SELECT USING (true);
CREATE POLICY "Admins manage markets" ON public.markets
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- price_history
-- =========================================
CREATE TABLE public.price_history (
  id BIGSERIAL PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  yes_price NUMERIC(5,4) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_market_time ON public.price_history(market_id, recorded_at);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price history public read" ON public.price_history
  FOR SELECT USING (true);
CREATE POLICY "Admins write price history" ON public.price_history
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- comments
-- =========================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_market ON public.comments(market_id, created_at DESC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments public read" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Authed insert comments" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

-- =========================================
-- comment_likes
-- =========================================
CREATE TABLE public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes public read" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Users like own" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike own" ON public.comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- =========================================
-- Stub tables (Phase 2+)
-- =========================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  outcome TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(5,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(5,4) NOT NULL,
  cost_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  shares INTEGER NOT NULL DEFAULT 0,
  avg_price NUMERIC(5,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, market_id, outcome)
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- =========================================
-- Trigger: auto-create profile on signup
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
BEGIN
  new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.profiles (id, display_name, phone, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.phone,
    new_code
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- updated_at trigger
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER markets_updated BEFORE UPDATE ON public.markets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
