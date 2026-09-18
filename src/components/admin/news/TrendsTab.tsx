import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, TrendingUp, TrendingDown, Sparkles, Film, Table2, Activity, Plus, Twitter, Newspaper } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { TrendingKeyword } from "./types";

type Mode = "table" | "cinematic";

function lifecycleStyle(lc: string) {
  if (lc === "peaking")
    return {
      ring: "ring-orange-500/60 shadow-[0_0_24px_-4px_rgba(249,115,22,0.55)]",
      chip: "bg-orange-500/15 text-orange-400 border-orange-500/30",
      dot: "bg-orange-500",
      glow: true,
    };
  if (lc === "rising")
    return {
      ring: "ring-emerald-500/40 shadow-[0_0_18px_-6px_rgba(16,185,129,0.45)]",
      chip: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-500",
      glow: false,
    };
  if (lc === "declining")
    return {
      ring: "ring-sky-500/30",
      chip: "bg-sky-500/10 text-sky-400 border-sky-500/30",
      dot: "bg-sky-500",
      glow: false,
    };
  // emerging
  return {
    ring: "ring-primary/30",
    chip: "bg-primary/10 text-primary border-primary/30",
    dot: "bg-primary",
    glow: false,
  };
}

export function TrendsTab({ trends }: { trends: TrendingKeyword[] }) {
  const [mode, setMode] = useState<Mode>("cinematic");
  const top = trends.slice(0, 30);
  const qualityCount = trends.filter(
    (t) => t.keyword.includes(" ") || t.keyword.length >= 6,
  ).length;
  const qualityPct = trends.length > 0 ? Math.round((qualityCount / trends.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
          <Activity className="h-3.5 w-3.5 text-success animate-pulse" />
          Live · {trends.length} keywords tracked
          <span className="opacity-50">·</span>
          <span className={cn(qualityPct >= 70 ? "text-success" : qualityPct >= 40 ? "text-warning" : "text-destructive")}>
            {qualityPct}% specific
          </span>
        </div>
        <div className="inline-flex rounded-md border border-border bg-card/50 p-0.5 text-xs">
          <button
            onClick={() => setMode("cinematic")}
            className={cn("px-3 py-1.5 rounded inline-flex items-center gap-1.5", mode === "cinematic" && "bg-primary/15 text-foreground")}
          >
            <Film className="h-3.5 w-3.5" /> Cinematic
          </button>
          <button
            onClick={() => setMode("table")}
            className={cn("px-3 py-1.5 rounded inline-flex items-center gap-1.5", mode === "table" && "bg-primary/15 text-foreground")}
          >
            <Table2 className="h-3.5 w-3.5" /> Table
          </button>
        </div>
      </div>

      {mode === "cinematic" ? <CinematicMode trends={top} /> : <TableMode trends={top} />}
    </div>
  );
}

function CinematicMode({ trends }: { trends: TrendingKeyword[] }) {
  if (trends.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
        <Sparkles className="h-6 w-6 mx-auto mb-3 opacity-40" />
        No trends yet — wait for the cron, or hit "Compute trends" above.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <AnimatePresence initial={false}>
        {trends.map((t, i) => {
          const ls = lifecycleStyle(t.lifecycle);
          const isPeaking = t.lifecycle === "peaking";
          const newsCount = t.mentions_1h + t.mentions_prev_1h;
          const tweetCount = t.social_mentions_6h;
          const totalSignal = newsCount + tweetCount;
          const newsPct = totalSignal > 0 ? (newsCount / totalSignal) * 100 : 100;
          return (
            <motion.div
              key={t.keyword}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.025, 0.4), type: "spring", stiffness: 120, damping: 18 }}
              className={cn(
                "relative rounded-2xl border border-border bg-gradient-to-br from-card to-card/30 p-4 ring-1 overflow-hidden",
                ls.ring,
              )}
            >
              {ls.glow && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{ opacity: [0.0, 0.22, 0.0] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  style={{ background: "radial-gradient(circle at 30% 0%, rgb(249 115 22 / 0.45), transparent 60%)" }}
                />
              )}
              <div className="relative">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-2">
                  <span className={cn("px-1.5 py-0.5 rounded border inline-flex items-center gap-1", ls.chip)}>
                    {isPeaking && <Flame className="h-3 w-3" />}
                    {t.lifecycle}
                  </span>
                  {t.category && (
                    <span className="px-1.5 py-0.5 rounded bg-muted/30 border border-border text-muted-foreground">
                      {t.category}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-muted-foreground">{(t.confidence * 100).toFixed(0)}%</span>
                </div>
                <h3 className="text-lg font-bold capitalize truncate">{t.keyword}</h3>

                {/* News volume bar */}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Newspaper className="h-3 w-3" />
                  <span className="font-mono">{newsCount}</span>
                  <div className="flex-1 h-1 rounded bg-muted/30 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${newsPct}%` }} />
                  </div>
                  {tweetCount > 0 && (
                    <>
                      <span className="font-mono">{tweetCount}</span>
                      <Twitter className="h-3 w-3 text-sky-500" />
                    </>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="News 24h" value={String(newsCount)} accent="text-foreground" />
                  <Metric
                    label="Growth"
                    value={`${(t.growth * 100).toFixed(0)}%`}
                    accent={t.growth > 0 ? "text-success" : t.growth < 0 ? "text-destructive" : "text-muted-foreground"}
                  />
                  <Metric
                    label="Sent"
                    value={`${t.avg_sentiment >= 0 ? "+" : ""}${t.avg_sentiment.toFixed(2)}`}
                    accent={t.avg_sentiment > 0.05 ? "text-success" : t.avg_sentiment < -0.05 ? "text-destructive" : "text-muted-foreground"}
                  />
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    <span>Trend score</span>
                    <span className={cn("font-mono font-bold", isPeaking ? "text-orange-400" : "text-foreground")}>
                      {t.trend_score.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-muted/40 overflow-hidden">
                    <motion.div
                      className={cn("h-full", ls.dot)}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, t.trend_score * 40)}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Create Market CTA */}
                {t.trend_score >= 1.0 && (
                  <Link
                    to="/admin/markets/create"
                    search={{ topic: t.keyword } as never}
                    className={cn(
                      "mt-3 inline-flex items-center justify-center gap-1.5 w-full text-xs font-medium px-3 py-1.5 rounded-md border transition",
                      isPeaking
                        ? "bg-orange-500/15 border-orange-500/40 text-orange-300 hover:bg-orange-500/25"
                        : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20",
                    )}
                  >
                    <Plus className="h-3 w-3" />
                    Create market
                  </Link>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function TableMode({ trends }: { trends: TrendingKeyword[] }) {
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div className="grid grid-cols-[1.5fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
        <div>Keyword</div>
        <div className="text-right">Lifecycle</div>
        <div className="text-right">6h</div>
        <div className="text-right">Growth</div>
        <div className="text-right">Sent</div>
        <div className="text-right">Score</div>
      </div>
      <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
        {trends.map((t) => {
          const isHot = t.lifecycle === "peaking";
          return (
            <motion.div
              key={t.keyword}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "grid grid-cols-[1.5fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 items-center text-sm",
                isHot && "bg-orange-500/5",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isHot && (
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }}>
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                  </motion.span>
                )}
                <span className="capitalize truncate font-medium">{t.keyword}</span>
                {t.category && (
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] uppercase tracking-wider">{t.category}</span>
                )}
              </div>
              <div className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">{t.lifecycle}</div>
              <div className="text-right font-mono">{t.mentions_1h}</div>
              <div
                className={cn(
                  "text-right font-mono inline-flex items-center justify-end gap-1",
                  t.growth > 0 ? "text-success" : t.growth < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t.growth > 0 ? <TrendingUp className="h-3 w-3" /> : t.growth < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {(t.growth * 100).toFixed(0)}%
              </div>
              <div
                className={cn(
                  "text-right font-mono text-xs",
                  t.avg_sentiment > 0.05 ? "text-success" : t.avg_sentiment < -0.05 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t.avg_sentiment >= 0 ? "+" : ""}{t.avg_sentiment.toFixed(2)}
              </div>
              <div className={cn("text-right font-mono font-bold", isHot ? "text-orange-500" : "text-foreground")}>
                {t.trend_score.toFixed(2)}
              </div>
            </motion.div>
          );
        })}
        {trends.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No trends yet — wait for the cron, or hit "Compute trends" above.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-md bg-muted/20 border border-border/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-bold text-sm mt-0.5", accent)}>{value}</div>
    </div>
  );
}
