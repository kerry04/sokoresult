import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Activity, Calendar, ArrowLeft, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKES, formatKESCompact, CATEGORY_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/u/$userId")({
  head: () => ({ meta: [{ title: "Trader profile — SokoResult" }] }),
  component: PublicProfilePage,
});

interface Stats {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  member_since: string;
  trade_count: number;
  volume_cents: number;
  realized_pnl_cents: number;
  unrealized_pnl_cents: number;
  total_pnl_cents: number;
  win_rate: number;
}

interface PublicPosition {
  market_id: string;
  slug: string;
  question: string;
  category: string;
  outcome: "YES" | "NO";
  shares: number;
  avg_price: number;
  current_price: number;
  pnl_pct: number;
}

function PublicProfilePage() {
  const { userId } = Route.useParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [positions, setPositions] = useState<PublicPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abort = false;
    (async () => {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.rpc("get_user_public_stats", { _user_id: userId }),
        supabase.rpc("get_user_public_positions", { _user_id: userId }),
      ]);
      if (abort) return;
      const row = ((s ?? []) as Stats[])[0] ?? null;
      setStats(row);
      setPositions(((p ?? []) as PublicPosition[]).map((x) => ({
        ...x,
        avg_price: Number(x.avg_price),
        current_price: Number(x.current_price),
        pnl_pct: Number(x.pnl_pct),
      })));
      setLoading(false);
    })();
    return () => {
      abort = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-4xl mx-auto text-center text-muted-foreground">
        Loading trader…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-4xl mx-auto text-center">
        <p className="text-muted-foreground">Trader not found.</p>
        <Link to="/leaderboard" className="mt-4 inline-block text-primary-foreground hover:underline">
          ← Back to leaderboard
        </Link>
      </div>
    );
  }

  const initials = (stats.display_name ?? "?").slice(0, 2).toUpperCase();
  const up = stats.total_pnl_cents >= 0;
  const memberFrom = new Date(stats.member_since).toLocaleDateString("en-KE", {
    month: "short",
    year: "numeric",
  });

  // Categories played → for "copy strategy" link
  const categories = Array.from(new Set(positions.map((p) => p.category).filter(Boolean)));

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6">
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Leaderboard
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="h-20 w-20 ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
            {stats.avatar_url && <AvatarImage src={stats.avatar_url} />}
            <AvatarFallback className="bg-primary/20 font-mono text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{stats.display_name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Member since {memberFrom}
              </span>
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3 w-3 text-warning" /> {stats.trade_count} trades
              </span>
            </div>
          </div>
          {categories.length > 0 && (
            <Link
              to="/markets"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium hover:bg-primary/25"
            >
              <Copy className="h-4 w-4" />
              Copy this strategy
            </Link>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Total P&L"
            value={`${up ? "+" : ""}${formatKES(stats.total_pnl_cents)}`}
            tone={up ? "success" : "danger"}
          />
          <Stat label="Win rate" value={`${stats.win_rate}%`} />
          <Stat label="Volume" value={formatKESCompact(stats.volume_cents)} />
          <Stat
            label="Realized"
            value={`${stats.realized_pnl_cents >= 0 ? "+" : ""}${formatKESCompact(
              stats.realized_pnl_cents,
            )}`}
            tone={stats.realized_pnl_cents >= 0 ? "success" : "danger"}
          />
        </div>
      </motion.div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Open positions
        </h2>
        {positions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            No open positions.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {positions.map((p) => {
              const up = p.pnl_pct >= 0;
              return (
                <Link
                  key={p.market_id}
                  to="/markets/$slug"
                  params={{ slug: p.slug }} search={{}}
                  className="block"
                >
                  <Card className="p-4 hover:border-primary/40 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <Badge variant="secondary" className="self-start text-[9px] uppercase tracking-wider">
                          {CATEGORY_LABEL[p.category] ?? p.category}
                        </Badge>
                        <p className="text-sm font-medium leading-snug line-clamp-2">
                          {p.question}
                        </p>
                      </div>
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
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <div className="text-muted-foreground">Entry</div>
                        <div>KSh {(p.avg_price * 100).toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Now</div>
                        <div>KSh {(p.current_price * 100).toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">P&L</div>
                        <div className={up ? "text-success" : "text-destructive"}>
                          {up ? "+" : ""}
                          {p.pnl_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground text-center pt-2">
        <TrendingUp className="inline h-3 w-3 mr-1" />
        For privacy, balance and transaction amounts are never shown publicly.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-base font-bold",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}
