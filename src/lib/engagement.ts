import { supabase } from "@/integrations/supabase/client";

export interface EngagementResult {
  ok: boolean;
  streak: { current: number; longest: number };
  newAchievements: string[];
  volume_cents: number;
  trade_count: number;
}

export async function recordTradeEngagement(
  marketId: string,
  category: string | null,
  secondsOnPage: number | null,
): Promise<EngagementResult | null> {
  const { data, error } = await (supabase.rpc as any)("record_trade_engagement", {
    _market_id: marketId,
    _category: category,
    _seconds_on_page: secondsOnPage,
  });
  if (error) {
    console.error("[engagement] record failed", error);
    return null;
  }
  return data as EngagementResult;
}

export async function fetchAchievements(codes: string[]) {
  if (!codes.length) return [];
  const { data } = await supabase.from("achievements").select("*").in("code", codes);
  return data ?? [];
}
