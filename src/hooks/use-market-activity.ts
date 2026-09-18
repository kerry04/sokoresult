import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MarketActivity {
  traders_1h: number;
  trades_1h: number;
  volume_1h_cents: number;
  buy_pressure_pct: number;
}

export function useMarketActivity(marketId: string | null, intervalMs = 20_000) {
  const [data, setData] = useState<MarketActivity | null>(null);

  useEffect(() => {
    if (!marketId) return;
    let cancelled = false;
    const load = async () => {
      const { data: r } = await (supabase.rpc as any)("market_activity", { _market_id: marketId });
      if (!cancelled && r) setData(r as MarketActivity);
    };
    load();
    const i = setInterval(load, intervalMs);

    // Realtime: refresh on new trades
    const ch = supabase
      .channel(`activity-${marketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades", filter: `market_id=eq.${marketId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(i);
      supabase.removeChannel(ch);
    };
  }, [marketId, intervalMs]);

  return data;
}
