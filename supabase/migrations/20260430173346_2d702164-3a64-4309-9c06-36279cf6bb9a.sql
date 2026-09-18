ALTER TABLE public.market_suggestions
  ADD COLUMN IF NOT EXISTS initial_probability numeric CHECK (initial_probability IS NULL OR (initial_probability >= 0 AND initial_probability <= 1)),
  ADD COLUMN IF NOT EXISTS edge_score numeric NOT NULL DEFAULT 0 CHECK (edge_score >= 0 AND edge_score <= 1),
  ADD COLUMN IF NOT EXISTS horizon text CHECK (horizon IS NULL OR horizon IN ('short','medium','long')),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS key_entities text[],
  ADD COLUMN IF NOT EXISTS cluster_key text,
  ADD COLUMN IF NOT EXISTS resolution_criteria text;

CREATE INDEX IF NOT EXISTS idx_market_suggestions_edge
  ON public.market_suggestions (status, edge_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_suggestions_cluster
  ON public.market_suggestions (cluster_key, created_at DESC)
  WHERE cluster_key IS NOT NULL;

INSERT INTO public.system_settings (key, value)
VALUES ('quant_min_edge_score', '0.25'::jsonb)
ON CONFLICT (key) DO NOTHING;