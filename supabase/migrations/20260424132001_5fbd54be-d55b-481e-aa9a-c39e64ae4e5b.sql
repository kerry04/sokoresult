CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  platform text NOT NULL DEFAULT 'twitter',
  text text NOT NULL,
  author text,
  post_url text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  engagement integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_url)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_keyword_posted ON public.social_posts (keyword, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_posted ON public.social_posts (posted_at DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Social posts public read"
  ON public.social_posts FOR SELECT
  USING (true);

CREATE POLICY "Admins write social posts"
  ON public.social_posts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.trending_keywords
  ADD COLUMN IF NOT EXISTS social_mentions_6h integer NOT NULL DEFAULT 0;