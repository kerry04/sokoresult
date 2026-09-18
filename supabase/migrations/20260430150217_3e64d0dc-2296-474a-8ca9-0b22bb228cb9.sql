INSERT INTO public.system_settings (key, value) VALUES
  ('quant_alpha', '1.5'::jsonb),
  ('quant_lambda_per_hour', '0.05'::jsonb),
  ('quant_edge_threshold', '0.03'::jsonb),
  ('quant_kelly_fraction', '0.25'::jsonb),
  ('quant_min_confidence', '0.2'::jsonb),
  ('quant_recommend_bankroll_kes', '100000'::jsonb)
ON CONFLICT (key) DO NOTHING;