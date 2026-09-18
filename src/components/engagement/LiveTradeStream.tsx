import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { TrendingDown, TrendingUp, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatKESCompact } from "@/lib/format";

interface LiveTrade {
  id: string;
  user_id: string;
  side: string;
  outcome: string;
  quantity: number;
  cost_cents: number;
  created_at: string;
}

export function LiveTradeStream({ marketId }: { marketId: string }) {
  const [trades, setTrades] = useState<LiveTrade[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("trades")
        .select("id, user_id, side, outcome, quantity, cost_cents, created_at")
        .eq("market_id", marketId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled && data) setTrades(data as LiveTrade[]);
    })();

    const ch = supabase
      .channel(`stream-${marketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades", filter: `market_id=eq.${marketId}` },
        (payload) => {
          const t = payload.new as LiveTrade;
          setTrades((prev) => [t, ...prev].slice(0, 10));
          if (t.cost_cents > 50000) {
            toast(`🐋 Whale trade: ${t.side} ${t.quantity} @ ${formatKESCompact(t.cost_cents)}`, {
              duration: 5000,
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [marketId]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Live trades
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-success flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
        </span>
      </div>
      {trades.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">No trades yet</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-hidden">
          <AnimatePresence initial={false}>
            {trades.map((t) => {
              const buy = t.side === "BUY";
              const masked = "•••" + t.user_id.slice(-4);
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-background/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {buy ? (
                      <TrendingUp className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-mono text-muted-foreground">{masked}</span>
                    <span className={buy ? "text-success" : "text-destructive"}>
                      {t.side} {t.quantity}
                    </span>
                  </div>
                  <span className="font-mono text-foreground/80">
                    {formatKESCompact(t.cost_cents)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
