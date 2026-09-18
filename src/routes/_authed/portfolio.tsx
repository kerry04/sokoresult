import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/markets/Sparkline";
import { formatKES } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EquityHero } from "@/components/portfolio/EquityHero";
import { CapitalDeployer } from "@/components/portfolio/CapitalDeployer";

export const Route = createFileRoute("/_authed/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — SokoResult" }] }),
  component: PortfolioPage,
});

interface PositionRow {
  id: string;
  market_id: string;
  outcome: "YES" | "NO";
  shares: number;
  avg_price: number;
  market: {
    slug: string;
    question: string;
    yes_price: number;
    no_price: number;
    category: string;
  };
  spark: number[];
}

interface TradeRow {
  id: string;
  outcome: string;
  quantity: number;
  price: number;
  cost_cents: number;
  side: "BUY" | "SELL";
  created_at: string;
  market: { question: string };
}

function PortfolioPage() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [realizedCents, setRealizedCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deployerOpen, setDeployerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let abort = false;
    (async () => {
      // Positions (RLS scopes by user)
      const { data: pos } = await supabase
        .from("positions")
        .select("id, market_id, outcome, shares, avg_price")
        .eq("user_id", user.id)
        .gt("shares", 0)
        .order("updated_at", { ascending: false });

      const marketIds = Array.from(new Set((pos ?? []).map((p) => p.market_id)));
      const marketsById = new Map<
        string,
        { slug: string; question: string; yes_price: number; no_price: number; category: string }
      >();
      const sparkById = new Map<string, number[]>();
      if (marketIds.length) {
        const { data: ms } = await supabase
          .from("markets")
          .select("id, slug, question, yes_price, no_price, category")
          .in("id", marketIds);
        (ms ?? []).forEach((m: any) => marketsById.set(m.id, m));

        const { data: ph } = await supabase
          .from("price_history")
          .select("market_id, yes_price, recorded_at")
          .in("market_id", marketIds)
          .order("recorded_at", { ascending: true });
        (ph ?? []).forEach((p: any) => {
          const arr = sparkById.get(p.market_id) ?? [];
          arr.push(Number(p.yes_price));
          sparkById.set(p.market_id, arr);
        });
      }

      if (abort) return;
      setPositions(
        (pos ?? []).map((p: any) => {
          const m = marketsById.get(p.market_id);
          const yesSpark = sparkById.get(p.market_id) ?? [];
          const spark = p.outcome === "YES" ? yesSpark : yesSpark.map((v) => 1 - v);
          return {
            ...p,
            avg_price: Number(p.avg_price),
            market:
              m ??
              { slug: "", question: "Unknown market", yes_price: 0.5, no_price: 0.5, category: "" },
            spark: spark.slice(-20),
          } as PositionRow;
        }),
      );

      // Trades — now uses real `side` column, scoped to current user
      const { data: tr } = await supabase
        .from("trades")
        .select("id, market_id, outcome, quantity, price, cost_cents, side, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      const tradeMarketIds = Array.from(new Set((tr ?? []).map((t: any) => t.market_id)));
      const tradeMarketsById = new Map<string, { question: string }>();
      if (tradeMarketIds.length) {
        const { data: ms } = await supabase
          .from("markets")
          .select("id, question")
          .in("id", tradeMarketIds);
        (ms ?? []).forEach((m: any) => tradeMarketsById.set(m.id, m));
      }

      if (abort) return;
      setTrades(
        (tr ?? []).map((t: any) => ({
          ...t,
          price: Number(t.price),
          side: (t.side as "BUY" | "SELL") ?? "BUY",
          market: tradeMarketsById.get(t.market_id) ?? { question: "Unknown" },
        })),
      );

      // Realized P&L = sum of trade transactions (negative for buys, positive for sells/payouts)
      const { data: txns } = await supabase
        .from("transactions")
        .select("amount_cents, type")
        .eq("user_id", user.id)
        .in("type", ["trade", "payout"]);
      if (abort) return;
      const realized = (txns ?? []).reduce(
        (s: number, t: any) => s + Number(t.amount_cents),
        0,
      );
      setRealizedCents(realized);

      setLoading(false);
    })();
    return () => {
      abort = true;
    };
  }, [user]);

  const portfolioValue = positions.reduce((s, p) => {
    const px = p.outcome === "YES" ? Number(p.market.yes_price) : Number(p.market.no_price);
    return s + p.shares * px * 100;
  }, 0);
  const cost = positions.reduce((s, p) => s + p.shares * p.avg_price * 100, 0);
  const unrealized = portfolioValue - cost;

  const winners = positions.filter((p) => {
    const px = p.outcome === "YES" ? Number(p.market.yes_price) : Number(p.market.no_price);
    return px > p.avg_price;
  }).length;
  const winRate = positions.length ? Math.round((winners / positions.length) * 100) : 0;

  // For "For you" tab in the deployer
  const userCategories = Array.from(
    new Set(positions.map((p) => p.market.category).filter(Boolean)),
  );

  // Group trades by day
  const byDay = new Map<string, TradeRow[]>();
  trades.forEach((t) => {
    const d = new Date(t.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key =
      d.toDateString() === today.toDateString()
        ? "Today"
        : d.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : d.toLocaleDateString("en-KE", { month: "short", day: "numeric" });
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  });

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <EquityHero
        portfolioValueCents={portfolioValue}
        unrealizedPnlCents={unrealized}
        realizedPnlCents={realizedCents}
        onDeploy={() => setDeployerOpen(true)}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Trades" value={String(trades.length)} />
        <StatCard label="Win Rate" value={`${winRate}%`} ring={winRate} />
        <StatCard
          label="Cost Basis"
          value={formatKES(cost)}
        />
        <StatCard
          label="Open Positions"
          value={String(positions.length)}
        />
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Active positions
        </h2>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : positions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No open positions yet.{" "}
            <button
              onClick={() => setDeployerOpen(true)}
              className="text-success hover:underline font-medium"
            >
              Deploy capital
            </button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {positions.map((p) => {
              const px =
                p.outcome === "YES" ? Number(p.market.yes_price) : Number(p.market.no_price);
              const pv = p.shares * px * 100;
              const pc = p.shares * p.avg_price * 100;
              const upnl = pv - pc;
              const upct = pc > 0 ? (upnl / pc) * 100 : 0;
              const up = upnl >= 0;
              return (
                <Card key={p.id} className="p-4 hover:border-primary/40 transition">
                  <Link
                    to="/markets/$slug"
                    params={{ slug: p.market.slug }}
                    search={{}}
                    className="block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-snug line-clamp-2">
                        {p.market.question}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full",
                          p.outcome === "YES"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {p.shares} {p.outcome}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-mono">
                      <div>
                        <div className="text-muted-foreground">Avg</div>
                        <div>KSh {(p.avg_price * 100).toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Now</div>
                        <div>KSh {(px * 100).toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Value</div>
                        <div>{formatKES(pv)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">P&L</div>
                        <div className={up ? "text-success" : "text-destructive"}>
                          {up ? "+" : ""}
                          {upct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    {p.spark.length > 1 && (
                      <div className="mt-2 -mx-1">
                        <Sparkline points={p.spark} />
                      </div>
                    )}
                  </Link>
                  <div className="mt-3 flex justify-end">
                    <Link
                      to="/markets/$slug"
                      params={{ slug: p.market.slug }}
                      search={{ tab: "sell" as const, side: p.outcome }}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-500 hover:bg-amber-500/20 transition"
                    >
                      Sell
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Trade history
        </h2>
        {trades.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No trades yet.</Card>
        ) : (
          <div className="space-y-5">
            {Array.from(byDay.entries()).map(([day, items]) => (
              <div key={day}>
                <div className="text-xs text-muted-foreground mb-2">{day}</div>
                <Card className="divide-y divide-border">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center",
                          t.side === "BUY"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {t.side === "BUY" ? (
                          <ArrowDownRight className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {t.side === "BUY" ? "Bought" : "Sold"} {t.quantity} {t.outcome} —{" "}
                          {t.market.question}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleTimeString("en-KE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          <span className="ml-2 font-mono">@ KSh {(t.price * 100).toFixed(0)}</span>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "font-mono text-sm",
                          t.side === "BUY" ? "text-foreground" : "text-success",
                        )}
                      >
                        {t.side === "BUY" ? "-" : "+"}
                        {formatKES(t.cost_cents)}
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>

      <CapitalDeployer
        open={deployerOpen}
        onClose={() => setDeployerOpen(false)}
        userCategories={userCategories}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  ring,
}: {
  label: string;
  value: string;
  ring?: number;
}) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
      {ring !== undefined && (
        <svg className="absolute right-3 top-3 h-10 w-10 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeOpacity="0.25"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="oklch(0.78 0.22 150)"
            strokeWidth="3"
            strokeDasharray={`${(ring / 100) * 94.2} 94.2`}
            strokeLinecap="round"
          />
        </svg>
      )}
    </Card>
  );
}
