-- News articles (admin/curated content + user submissions)
CREATE TABLE public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  source_name text NOT NULL,
  source_url text,
  category public.market_category NOT NULL,
  is_breaking boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_created_at ON public.news_articles (created_at DESC);
CREATE INDEX idx_news_category ON public.news_articles (category);

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "News public read"
  ON public.news_articles FOR SELECT
  USING (true);

CREATE POLICY "Authed users submit news"
  ON public.news_articles FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Admins manage news"
  ON public.news_articles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed 8 Kenyan/African headlines, linked to existing markets where the slug matches.
INSERT INTO public.news_articles (title, body, source_name, source_url, category, is_breaking, is_verified, market_id)
VALUES
  ('Ruto unveils sweeping digital economy initiative ahead of 2027',
   'President William Ruto announced a multi-billion shilling digital economy push, framing it as central to his re-election pitch. Analysts say the move could shift voter sentiment in urban counties.',
   'KTN News', 'https://ktnnews.com', 'politics', true, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%ruto%' LIMIT 1)),

  ('Harambee Stars unveil 26-man squad for AFCON qualifier',
   'Coach Engin Firat has named a strong squad with three Europe-based stars returning. Captain Michael Olunga leads the line as Kenya hunts a critical away win.',
   'Citizen Digital', 'https://citizen.digital', 'sports', false, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%harambee%' OR slug ILIKE '%afcon%' LIMIT 1)),

  ('Lagos Fashion Week to expand into Nairobi and Accra in 2026',
   'Organisers confirmed a pan-African expansion, with a flagship Nairobi edition planned for April. Local designers are already applying for the runway slate.',
   'The Independent', 'https://independent.ng', 'fashion', false, false,
   (SELECT id FROM public.markets WHERE slug ILIKE '%lagos%' OR slug ILIKE '%fashion%' LIMIT 1)),

  ('M-Pesa launches instant cross-border payments in five new countries',
   'Safaricom and Vodacom rolled out near-instant remittances across East and Southern Africa, undercutting incumbents on fees by up to 60%.',
   'NTV Kenya', 'https://ntvkenya.co.ke', 'economics', false, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%mpesa%' OR slug ILIKE '%m-pesa%' LIMIT 1)),

  ('Gen-Z organisers call new nationwide day of action',
   'A coalition of youth movements has called for peaceful protests in 12 counties, citing the cost of living and governance concerns.',
   'The Standard', 'https://standardmedia.co.ke', 'politics', true, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%gen-z%' OR slug ILIKE '%protest%' LIMIT 1)),

  ('Gachagua impeachment review heads to Supreme Court next month',
   'The former Deputy President''s legal team confirmed the constitutional petition has been listed. A ruling could reshape the 2027 succession map.',
   'Capital FM', 'https://capitalfm.co.ke', 'politics', false, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%gachagua%' LIMIT 1)),

  ('Kipchoge hints at one final marathon — and possible retirement',
   'In a candid interview, the legendary marathoner suggested 2026 could be his last competitive year on the road.',
   'Nation Africa', 'https://nation.africa', 'sports', false, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%kipchoge%' LIMIT 1)),

  ('Nollywood smashes box office record with new historical epic',
   'A Lagos-shot historical drama has crossed the ₦2 billion mark in its opening weeks, making it the highest-grossing African film of the year.',
   'Pulse Nigeria', 'https://pulse.ng', 'entertainment', false, true,
   (SELECT id FROM public.markets WHERE slug ILIKE '%nollywood%' OR slug ILIKE '%oscar%' LIMIT 1));
