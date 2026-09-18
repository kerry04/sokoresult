DROP VIEW IF EXISTS public.market_depth_v;

CREATE VIEW public.market_depth_v
WITH (security_invoker = true)
AS
SELECT
  m.id AS market_id,
  m.slug,
  m.question,
  m.market_type,
  m.status,
  m.liquidity_b AS b,
  (m.liquidity_b * 10)::numeric AS initial_liquidity_kes,
  ROUND((m.liquidity_b * ln(1.01))::numeric, 2) AS cost_per_cent_kes,
  m.initial_prob,
  m.yes_price,
  m.volume_cents
FROM public.markets m;

GRANT SELECT ON public.market_depth_v TO anon, authenticated;