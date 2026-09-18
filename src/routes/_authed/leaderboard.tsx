import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Activity, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatKES, formatKESCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — SokoResult" }] }),
  component: LeaderboardPage,
});

interface Row {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  trade_count: number;
  volume_cents: number;
  realized_pnl_cents: number;
  unrealized_pnl_cents: number;
  total_pnl_cents: number;
  win_rate: number;
}

type Period = "rising" | "all" | "30d" | "7d";
type Sort = "pnl" | "winrate" | "volume";

function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [sort, setSort] = useState<Sort>("pnl");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    (async () => {
      if (period === "rising") {
        const { data, error } = await (supabase.rpc as any)("leaderboard_rising_stars", { _limit: 50 });
        if (abort) return;
        if (error) {
          console.error(error);
          setRows([]);
        } else {
          setRows(
            ((data ?? []) as any[]).map((r) => ({
              user_id: r.user_id,
              display_name: r.display_name ?? "Trader",
              avatar_url: r.avatar_url ?? null,
              trade_count: r.trade_count ?? 0,
              volume_cents: r.volume_24h_cents ?? 0,
              realized_pnl_cents: r.pnl_24h_cents ?? 0,
              unrealized_pnl_cents: 0,
              total_pnl_cents: r.pnl_24h_cents ?? 0,
              win_rate: 0,
            })),
          );
        }
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_leaderboard", {
        _limit: 50,
        _period: period,
      });
      if (abort) return;
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows(((data ?? []) as Row[]).map((r) => ({ ...r, win_rate: Number(r.win_rate) })));
      }
      setLoading(false);
    })();
    const t = setInterval(() => {
      if (period === "rising") return;
      supabase.rpc("get_leaderboard", { _limit: 50, _period: period }).then(({ data }) => {
        if (!abort && data) setRows(data as Row[]);
      });
    }, 60_000);
    return () => {
      abort = true;
      clearInterval(t);
    };
  }, [period]);

  const sorted = [...rows].sort((a, b) => {
    if (sort === "winrate") return Number(b.win_rate) - Number(a.win_rate);
    if (sort === "volume") return b.volume_cents - a.volume_cents;
    return b.total_pnl_cents - a.total_pnl_cents;
  });

  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-warning" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            The sharpest traders on SokoResult. Tap any name to copy their playbook.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Pills options={[
          { k: "rising", l: "🔥 Rising 24h" },
          { k: "all", l: "All-time" },
          { k: "30d", l: "30d" },
          { k: "7d", l: "7d" },
        ]} value={period} onChange={(v) => setPeriod(v as Period)} />
        <span className="ml-auto" />
        <Pills options={[
          { k: "pnl", l: "P&L" },
          { k: "winrate", l: "Win rate" },
          { k: "volume", l: "Volume" },
        ]} value={sort} onChange={(v) => setSort(v as Sort)} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No traders yet — be the first.
        </Card>
      ) : (
        <>
          {sort === "pnl" && top3.length >= 1 && <Podium top={top3} />}

          <Card className="divide-y divide-border overflow-hidden">
            {(sort === "pnl" ? rest : sorted).map((r, i) => (
              <LeaderRow
                key={r.user_id}
                rank={(sort === "pnl" ? 4 : 1) + i}
                row={r}
                metric={sort}
              />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function Pills({
  options,
  value,
  onChange,
}: {
  options: Array<{ k: string; l: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-muted/40 p-1 text-xs">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={cn(
            "px-3 py-1.5 rounded-lg transition",
            value === o.k
              ? "bg-card text-foreground shadow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Podium({ top }: { top: Row[] }) {
  const [first, second, third] = top;
  return (
    <div className="grid grid-cols-3 gap-3 items-end">
      {/* 2nd */}
      {second ? <PodiumCard row={second} place={2} /> : <div />}
      {/* 1st */}
      {first ? <PodiumCard row={first} place={1} /> : <div />}
      {/* 3rd */}
      {third ? <PodiumCard row={third} place={3} /> : <div />}
    </div>
  );
}

const PLACE_STYLE: Record<number, { ring: string; bg: string; label: string; height: string }> = {
  1: {
    ring: "ring-warning",
    bg: "from-warning/30 via-warning/10 to-card",
    label: "text-warning",
    height: "min-h-[170px]",
  },
  2: {
    ring: "ring-muted-foreground",
    bg: "from-muted/40 via-muted/10 to-card",
    label: "text-muted-foreground",
    height: "min-h-[140px]",
  },
  3: {
    ring: "ring-orange-500/70",
    bg: "from-orange-500/25 via-orange-500/5 to-card",
    label: "text-orange-400",
    height: "min-h-[125px]",
  },
};

function PodiumCard({ row, place }: { row: Row; place: number }) {
  const s = PLACE_STYLE[place];
  const initials = (row.display_name ?? "?").slice(0, 2).toUpperCase();
  const up = row.total_pnl_cents >= 0;
  return (
    <Link
      to="/u/$userId"
      params={{ userId: row.user_id }}
      className={cn(
        "relative block rounded-2xl border border-border bg-gradient-to-b p-4 text-center transition hover:border-primary/40",
        s.bg,
        s.height,
      )}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: place * 0.08, duration: 0.45 }}
        className="flex flex-col items-center gap-2"
      >
        {place === 1 && <Crown className="h-5 w-5 text-warning -mb-1" />}
        <Avatar className={cn("h-14 w-14 ring-2 ring-offset-2 ring-offset-background", s.ring)}>
          {row.avatar_url && <AvatarImage src={row.avatar_url} />}
          <AvatarFallback className="bg-primary/20 font-mono text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className={cn("text-[10px] font-mono uppercase tracking-wider", s.label)}>
          #{place}
        </div>
        <div className="text-sm font-semibold truncate max-w-full">{row.display_name}</div>
        <div
          className={cn(
            "font-mono text-base font-bold",
            up ? "text-success" : "text-destructive",
          )}
        >
          {up ? "+" : ""}
          {formatKES(row.total_pnl_cents)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {row.win_rate}% win · {row.trade_count} trades
        </div>
      </motion.div>
    </Link>
  );
}

function LeaderRow({ rank, row, metric }: { rank: number; row: Row; metric: Sort }) {
  const initials = (row.display_name ?? "?").slice(0, 2).toUpperCase();
  const up = row.total_pnl_cents >= 0;
  return (
    <Link
      to="/u/$userId"
      params={{ userId: row.user_id }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition"
    >
      <div className="w-7 text-center font-mono text-sm text-muted-foreground tabular-nums">
        {rank}
      </div>
      <Avatar className="h-9 w-9">
        {row.avatar_url && <AvatarImage src={row.avatar_url} />}
        <AvatarFallback className="bg-primary/15 font-mono text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{row.display_name}</div>
        <div className="text-[11px] text-muted-foreground flex gap-3">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" /> {row.trade_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> {row.win_rate}%
          </span>
          <span className="hidden sm:inline">Vol {formatKESCompact(row.volume_cents)}</span>
        </div>
      </div>
      <div
        className={cn(
          "font-mono text-sm font-bold tabular-nums",
          metric === "pnl" && (up ? "text-success" : "text-destructive"),
        )}
      >
        {metric === "pnl"
          ? `${up ? "+" : ""}${formatKES(row.total_pnl_cents)}`
          : metric === "winrate"
          ? `${row.win_rate}%`
          : formatKESCompact(row.volume_cents)}
      </div>
    </Link>
  );
}
