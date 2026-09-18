import { useMarketActivity } from "@/hooks/use-market-activity";
import { BuyPressureGauge } from "./BuyPressureGauge";
import { LiveTradersPill } from "./HotBadges";
import { Activity, TrendingUp, Users } from "lucide-react";
import { formatKESCompact } from "@/lib/format";

export function MarketActivityStrip({ marketId }: { marketId: string }) {
  const a = useMarketActivity(marketId);
  if (!a) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Stat icon={<Users className="h-3.5 w-3.5" />} label="Traders 1h" value={a.traders_1h.toString()} />
          <Stat icon={<Activity className="h-3.5 w-3.5" />} label="Trades 1h" value={a.trades_1h.toString()} />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Volume 1h"
            value={formatKESCompact(a.volume_1h_cents)}
          />
        </div>
        <LiveTradersPill count={a.traders_1h} />
      </div>
      <BuyPressureGauge pct={a.buy_pressure_pct ?? 50} />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono font-bold text-sm">{value}</span>
    </div>
  );
}
