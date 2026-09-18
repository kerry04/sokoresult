import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTimeDecay, decide, updateFromSentiment } from "@/lib/quant";

const PARAM_KEYS = [
  "quant_alpha",
  "quant_lambda_per_hour",
  "quant_edge_threshold",
  "quant_kelly_fraction",
  "quant_min_confidence",
  "quant_recommend_bankroll_kes",
] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

const DEFAULTS: Record<ParamKey, number> = {
  quant_alpha: 1.5,
  quant_lambda_per_hour: 0.05,
  quant_edge_threshold: 0.03,
  quant_kelly_fraction: 0.25,
  quant_min_confidence: 0.2,
  quant_recommend_bankroll_kes: 100000,
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    throw new Error("Unable to verify admin role. Please try again.");
  }
  if (!data) {
    throw new Error("Admin role required to view edge opportunities.");
  }
}

async function loadParams(supabase: any): Promise<Record<ParamKey, number>> {
  const { data } = await supabase
    .from("system_settings")
    .select("key,value")
    .in("key", PARAM_KEYS as unknown as string[]);
  const out = { ...DEFAULTS };
  for (const row of data ?? []) {
    const k = row.key as ParamKey;
    const v = typeof row.value === "number" ? row.value : Number(row.value);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export interface EdgeRow {
  market_id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  p_model: number;
  edge: number;
  confidence: number;
  signal_prob: number | null;
  avg_sentiment: number;
  s_effective: number;
  age_hours: number;
  liquidity_b: number;
  bet_kes: number;
  side: "YES" | "NO";
  action: "BUY_YES" | "BUY_NO" | "HOLD";
  reason: string;
  news_count: number;
  social_count: number;
}

export const getEdgeOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const params = await loadParams(supabase);

    const { data: markets, error } = await supabase
      .from("markets")
      .select(
        "id, slug, question, category, yes_price, liquidity_b, status, market_type",
      )
      .eq("status", "open")
      .eq("market_type", "binary");
    if (error) throw new Error(error.message);

    const ids = (markets ?? []).map((m: any) => m.id);
    if (ids.length === 0) return { params, opportunities: [] as EdgeRow[] };

    const { data: signals } = await supabase
      .from("market_signals")
      .select(
        "market_id, signal_prob, confidence, avg_sentiment, news_count, social_count, computed_at",
      )
      .in("market_id", ids);

    const sigByMarket = new Map<string, any>();
    for (const s of signals ?? []) sigByMarket.set(s.market_id, s);

    const now = Date.now();
    const rows: EdgeRow[] = [];

    for (const m of markets ?? []) {
      const sig = sigByMarket.get(m.id);
      if (!sig) continue;
      const ageHours =
        (now - new Date(sig.computed_at).getTime()) / (1000 * 60 * 60);
      const sEff = applyTimeDecay(
        Number(sig.avg_sentiment ?? 0),
        params.quant_lambda_per_hour,
        ageHours,
      );
      const pMarket = Number(m.yes_price);
      const pModel = updateFromSentiment(pMarket, sEff, params.quant_alpha);
      const dec = decide({
        pMarket,
        pModel,
        bankroll: params.quant_recommend_bankroll_kes,
        threshold: params.quant_edge_threshold,
        kellyFraction: params.quant_kelly_fraction,
        maxPct: 0.05,
        confidence: Number(sig.confidence ?? 0),
        minConfidence: params.quant_min_confidence,
      });

      rows.push({
        market_id: m.id,
        slug: m.slug,
        question: m.question,
        category: m.category,
        yes_price: pMarket,
        p_model: pModel,
        edge: dec.edge,
        confidence: Number(sig.confidence ?? 0),
        signal_prob: sig.signal_prob != null ? Number(sig.signal_prob) : null,
        avg_sentiment: Number(sig.avg_sentiment ?? 0),
        s_effective: sEff,
        age_hours: ageHours,
        liquidity_b: Number(m.liquidity_b),
        bet_kes: Math.round(dec.betSize),
        side: dec.edge >= 0 ? "YES" : "NO",
        action: dec.action,
        reason: dec.reason,
        news_count: sig.news_count ?? 0,
        social_count: sig.social_count ?? 0,
      });
    }

    rows.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    return { params, opportunities: rows };
  });

const ParamUpdate = z.object({
  quant_alpha: z.number().min(0).max(10).optional(),
  quant_lambda_per_hour: z.number().min(0).max(5).optional(),
  quant_edge_threshold: z.number().min(0).max(0.5).optional(),
  quant_kelly_fraction: z.number().min(0).max(1).optional(),
  quant_min_confidence: z.number().min(0).max(1).optional(),
  quant_recommend_bankroll_kes: z.number().min(0).max(1e9).optional(),
});

export const updateQuantParams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ParamUpdate.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const updates = Object.entries(data).filter(([, v]) => v !== undefined);
    for (const [key, value] of updates) {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          { key, value: value as number, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
    }
    return { ok: true, updated: updates.length };
  });
