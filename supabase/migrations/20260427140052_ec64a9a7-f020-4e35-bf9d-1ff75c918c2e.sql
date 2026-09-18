-- 1. Add initial_liquidity_cents column + backfill
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS initial_liquidity_cents bigint;

UPDATE public.markets
  SET initial_liquidity_cents = (liquidity_b * 1000)::bigint
  WHERE initial_liquidity_cents IS NULL;

-- 2. Update auto_seed trigger: respect initial_liquidity_cents, clamp p to [0.05, 0.95]
CREATE OR REPLACE FUNCTION public.auto_seed_market_lmsr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _b numeric;
  _p numeric;
  _logit numeric;
BEGIN
  -- Derive b from initial_liquidity_cents if provided, else from liquidity_b, else default
  IF NEW.initial_liquidity_cents IS NOT NULL AND NEW.initial_liquidity_cents > 0 THEN
    _b := (NEW.initial_liquidity_cents::numeric) / 1000.0;
  ELSE
    _b := COALESCE(NEW.liquidity_b, 750);
  END IF;
  IF _b < 250 THEN _b := 250; END IF;
  NEW.liquidity_b := _b;
  IF NEW.initial_liquidity_cents IS NULL THEN
    NEW.initial_liquidity_cents := (_b * 1000)::bigint;
  END IF;

  IF NEW.market_type = 'binary' THEN
    _p := COALESCE(NEW.yes_price, 0.5);
    IF _p < 0.05 THEN _p := 0.05; END IF;
    IF _p > 0.95 THEN _p := 0.95; END IF;
    _logit := _b * ln(_p / (1 - _p));
    NEW.q_yes := _logit;
    NEW.q_no := 0;
    NEW.yes_price := _p;
    NEW.no_price := 1 - _p;
    NEW.initial_prob := _p;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Tighten seed_lmsr_market clamp
CREATE OR REPLACE FUNCTION public.seed_lmsr_market(_market_id uuid, _initial_prob numeric, _b numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _m RECORD;
  _logit numeric;
  _p numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can seed markets';
  END IF;
  IF _b <= 0 THEN RAISE EXCEPTION 'b must be > 0'; END IF;

  -- Clamp p to [0.05, 0.95] for safety
  _p := _initial_prob;
  IF _p < 0.05 THEN _p := 0.05; END IF;
  IF _p > 0.95 THEN _p := 0.95; END IF;

  SELECT * INTO _m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;

  IF _m.market_type = 'binary' THEN
    _logit := _b * ln(_p / (1 - _p));
    UPDATE public.markets
      SET liquidity_b = _b,
          initial_liquidity_cents = (_b * 1000)::bigint,
          q_yes = _logit,
          q_no = 0,
          yes_price = _p,
          no_price = 1 - _p,
          initial_prob = _p,
          updated_at = now()
      WHERE id = _market_id;
  ELSE
    UPDATE public.markets
      SET liquidity_b = _b,
          initial_liquidity_cents = (_b * 1000)::bigint,
          initial_prob = _p,
          updated_at = now()
      WHERE id = _market_id;

    WITH base AS (
      SELECT id, _b * ln(GREATEST(price, 0.001)) AS raw_q FROM public.market_outcomes
        WHERE market_id = _market_id
    ),
    shifted AS (
      SELECT id, raw_q - (SELECT MIN(raw_q) FROM base) AS q_centered FROM base
    )
    UPDATE public.market_outcomes mo
      SET q = s.q_centered
      FROM shifted s
      WHERE mo.id = s.id;
  END IF;
END;
$function$;

-- 4. New: signal-aware seeding
CREATE OR REPLACE FUNCTION public.seed_lmsr_market_from_signal(
  _market_id uuid,
  _initial_prob numeric,
  _confidence numeric,
  _initial_liquidity_kes numeric DEFAULT 7500
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _b numeric;
  _c numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can seed markets';
  END IF;
  IF _initial_liquidity_kes <= 0 THEN RAISE EXCEPTION 'liquidity_kes must be > 0'; END IF;

  _c := COALESCE(_confidence, 0.5);
  IF _c < 0 THEN _c := 0; END IF;
  IF _c > 1 THEN _c := 1; END IF;

  -- b = (kes / 10) * (0.5 + 0.5 * confidence), floor 250
  _b := (_initial_liquidity_kes / 10.0) * (0.5 + 0.5 * _c);
  IF _b < 250 THEN _b := 250; END IF;

  PERFORM public.seed_lmsr_market(_market_id, _initial_prob, _b);

  RETURN jsonb_build_object(
    'ok', true,
    'b', _b,
    'initial_liquidity_kes', _b * 10,
    'confidence_used', _c,
    'clamped_prob', GREATEST(0.05, LEAST(0.95, _initial_prob))
  );
END;
$function$;

-- 5. Depth view (admin-readable; exposes derived depth metrics)
CREATE OR REPLACE VIEW public.market_depth_v AS
SELECT
  m.id AS market_id,
  m.slug,
  m.question,
  m.market_type,
  m.status,
  m.liquidity_b AS b,
  (m.liquidity_b * 10)::numeric AS initial_liquidity_kes,
  -- Approx KES cost to move price by 1 percentage point near 50/50: b * ln(1.01)
  ROUND((m.liquidity_b * ln(1.01))::numeric, 2) AS cost_per_cent_kes,
  m.initial_prob,
  m.yes_price,
  m.volume_cents
FROM public.markets m;

GRANT SELECT ON public.market_depth_v TO anon, authenticated;