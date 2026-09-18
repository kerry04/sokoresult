import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatKESPrecise, formatPricePrecise } from "@/lib/format";

interface Props {
  marketId: string;
  outcome: "YES" | "NO" | "CANDIDATE";
  outcomeId?: string | null;
  side: "BUY" | "SELL";
  quantity: number;
}

interface Sim {
  cost_cents: number;
  avg_price: number;
  price_before: number;
  price_after: number;
  slippage_bps: number;
}

interface Limits {
  hourly_remaining_cents: number;
  notional_cap_cents: number;
  ok?: boolean;
}

/** Calls simulate_lmsr_trade and shows cost / avg fill / slippage / new price + user trade caps. */
export function SlippagePreview({ marketId, outcome, outcomeId, side, quantity }: Props) {
  const [sim, setSim] = useState<Sim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.rpc as any)("get_user_trade_limits", { _market_id: marketId });
      if (data && data.ok !== false) setLimits(data as Limits);
      else setLimits(null);
    })();
  }, [marketId]);

  useEffect(() => {
    if (!quantity || quantity < 1) {
      setSim(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await (supabase.rpc as any)("simulate_lmsr_trade", {
        _market_id: marketId,
        _outcome: outcome,
        _outcome_id: outcomeId ?? null,
        _side: side,
        _quantity: quantity,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        setSim(null);
        return;
      }
      setError(null);
      setSim(data as Sim);
    }, 200);
    return () => clearTimeout(t);
  }, [marketId, outcome, outcomeId, side, quantity]);

  if (error) {
    return <div className="text-xs text-destructive font-mono">{error}</div>;
  }
  if (!sim) {
    return (
      <div className="text-xs text-muted-foreground font-mono h-16 flex items-center">
        {loading ? "Calculating…" : "Enter a quantity to preview"}
      </div>
    );
  }

  const slippagePct = sim.slippage_bps / 100;
  const slippageBad = Math.abs(slippagePct) > 5;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs font-mono">
      <Row label={side === "BUY" ? "Pay" : "Receive"}
        value={formatKESPrecise(sim.cost_cents)} accent />
      <Row label="Avg fill" value={formatPricePrecise(sim.avg_price)} />
      <Row
        label="Price impact"
        value={`${formatPricePrecise(sim.price_before)} → ${formatPricePrecise(sim.price_after)}`}
      />
      <Row
        label="Slippage"
        value={`${slippagePct >= 0 ? "+" : ""}${slippagePct.toFixed(2)}%`}
        className={cn(slippageBad ? "text-destructive" : "text-muted-foreground")}
      />
      {limits && (
        <div className="pt-1.5 mt-1.5 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Hourly left: {formatKESPrecise(limits.hourly_remaining_cents)}</span>
          <span>Position cap: {formatKESPrecise(limits.notional_cap_cents)}</span>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</span>
      <span className={cn(accent && "text-foreground font-semibold", className)}>{value}</span>
    </div>
  );
}
