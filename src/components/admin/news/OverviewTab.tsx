import { motion } from "framer-motion";
import { Activity, Database, Sparkles, TrendingUp, TrendingDown, Flame, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceHealth, TrendingKeyword, MarketSuggestion } from "./types";

interface Totals {
  total: number;
  processed: number;
  unprocessed: number;
  last1h: number;
  last24h: number;
  avgSentiment: number;
}

interface CategoryStat { category: string; count: number; avgSentiment: number }

export function OverviewTab({
  totals,
  categories,
  sourceHealth,
  trends,
  suggestions,
}: {
  totals: Totals | null;
  categories: CategoryStat[];
  sourceHealth: SourceHealth[];
  trends: TrendingKeyword[];
  suggestions: MarketSuggestion[];
}) {
  const active = sourceHealth.filter((s) => s.status === "active").length;
  const stale = sourceHealth.filter((s) => s.status === "stale").length;
  const down = sourceHealth.filter((s) => s.status === "down").length;
  const trendingCount = trends.filter((t) => t.trend_score >= 0.3 && t.mentions_1h >= 3).length;
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending").length;
  const avg = totals?.avgSentiment ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total articles" value={totals?.total ?? 0} icon={Database} accent="text-primary" />
        <Kpi
          label="Last 24h"
          value={totals?.last24h ?? 0}
          sub={`${totals?.last1h ?? 0} in last hour`}
          icon={Activity}
          accent="text-success"
          live
        />
        <Kpi
          label="AI-analyzed"
          value={totals?.processed ?? 0}
          sub={`${totals?.unprocessed ?? 0} pending`}
          icon={Sparkles}
          accent="text-accent"
        />
        <Kpi
          label="Avg sentiment"
          value={avg.toFixed(2)}
          icon={avg >= 0 ? TrendingUp : TrendingDown}
          accent={avg > 0.05 ? "text-success" : avg < -0.05 ? "text-destructive" : "text-muted-foreground"}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthChip label="Active sources" value={active} dot="bg-success" pulse />
        <HealthChip label="Stale" value={stale} dot="bg-warning" />
        <HealthChip label="Down" value={down} dot="bg-destructive" />
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trending now</div>
            <div className="font-mono text-2xl font-bold mt-1">{trendingCount}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{pendingSuggestions} pending suggestions</div>
          </div>
          <Flame className="h-5 w-5 text-orange-500" />
        </div>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Coverage by category</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {categories.map((c) => {
            const max = Math.max(...categories.map((x) => x.count), 1);
            const pct = (c.count / max) * 100;
            return (
              <div key={c.category} className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${pct}%` }} />
                <div className="relative">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.category}</div>
                  <div className="font-mono text-2xl font-bold mt-1">{c.count}</div>
                  <div
                    className={cn(
                      "text-xs mt-1 font-mono",
                      c.avgSentiment > 0.05 ? "text-success" : c.avgSentiment < -0.05 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    sent {c.avgSentiment >= 0 ? "+" : ""}{c.avgSentiment.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">
              No categorized articles yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">Top trending keywords</h3>
          </div>
          <div className="space-y-1.5">
            {trends.slice(0, 6).map((t) => (
              <motion.div
                key={t.keyword}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between text-sm py-1"
              >
                <span className="capitalize">{t.keyword}</span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-muted-foreground">{t.mentions_1h}/h</span>
                  <span className={cn("font-bold", t.trend_score > 0.5 ? "text-orange-500" : "text-foreground")}>
                    {t.trend_score.toFixed(2)}
                  </span>
                </div>
              </motion.div>
            ))}
            {trends.length === 0 && <div className="text-xs text-muted-foreground py-3">No trends yet — run compute-trends.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">Latest market suggestions</h3>
          </div>
          <div className="space-y-2">
            {suggestions.slice(0, 4).map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm p-2 rounded-lg bg-card border border-border"
              >
                <div className="font-medium line-clamp-2">{s.suggested_question}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                  <span>conf {(s.confidence * 100).toFixed(0)}%</span>
                  <span>·</span>
                  <span>YES KSh {(s.suggested_yes_price * 100).toFixed(0)}</span>
                  <span className={cn("ml-auto", statusColor(s.status))}>{s.status}</span>
                </div>
              </motion.div>
            ))}
            {suggestions.length === 0 && <div className="text-xs text-muted-foreground py-3">None yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "approved") return "text-success";
  if (status === "rejected") return "text-destructive";
  return "text-warning";
}

function Kpi({
  label, value, sub, icon: Icon, accent, live,
}: {
  label: string; value: number | string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; accent: string; live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="font-mono text-3xl font-bold mt-2">{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          {live && <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
          {sub}
        </div>
      )}
    </div>
  );
}

function HealthChip({ label, value, dot, pulse }: { label: string; value: number; dot: string; pulse?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-2xl font-bold mt-1">{value}</div>
      </div>
      <span className={cn("h-2.5 w-2.5 rounded-full", dot, pulse && "animate-pulse")} />
    </div>
  );
}
