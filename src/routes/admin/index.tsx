import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, formatKESCompact } from "@/lib/format";
import {
  Activity, AlertTriangle, BarChart3, Droplets, LifeBuoy, Radio,
  TrendingUp, Users, Wallet, HeartPulse, CheckCircle2, XCircle, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/components/admin/news/types";

export const Route = createFileRoute("/admin/")({
  component: AdminTerminal,
});

interface Stats {
  total_users: number;
  active_users_24h: number;
  trades_24h: number;
  volume_24h_cents: number;
  total_liquidity_kes: number;
  active_markets: number;
  open_alerts: number;
  open_tickets: number;
}

interface Trade {
  id: string;
  market_id: string;
  user_id: string;
  side: string;
  outcome: string;
  quantity: number;
  price: number;
  cost_cents: number;
  created_at: string;
  market_question?: string;
  user_name?: string;
}

interface Alert {
  id: string;
  kind: string;
  severity: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface Market {
  id: string;
  slug: string;
  question: string;
  yes_price: number;
  volume_cents: number;
  trader_count: number;
  status: string;
}

interface Keyword {
  keyword: string;
  trend_score: number;
  mentions_1h: number;
  mentions_prev_1h: number;
  velocity: number;
  avg_sentiment: number;
  lifecycle: string;
  category: string | null;
}

interface SourceRow {
  source: string;
  status: string;
  articles_24h: number;
  last_success_at: string | null;
  consecutive_failures: number;
}

interface Pipeline {
  total_24h: number;
  processed_24h: number;
  pending: number;
  failed: number;
  last_trend_at: string | null;
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-destructive border-destructive/40 bg-destructive/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  info: "text-primary border-primary/40 bg-primary/10",
};

function lifecyclePill(lc: string) {
  const map: Record<string, string> = {
    peaking: "bg-destructive/15 text-destructive border-destructive/30",
    rising: "bg-warning/15 text-warning border-warning/30",
    emerging: "bg-primary/15 text-primary border-primary/30",
    declining: "bg-muted text-muted-foreground border-border",
  };
  return map[lc] ?? map.emerging;
}

function AdminTerminal() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [pipe, setPipe] = useState<Pipeline | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick clock once a second for pulsing live indicators
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Initial + periodic refresh
  const loadAll = async () => {
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [
      statsRes,
      tradesRes,
      alertsRes,
      marketsRes,
      keywordsRes,
      sourcesRes,
      total24Res,
      processedRes,
      pendingRes,
      failedRes,
      lastTrendRes,
    ] = await Promise.all([
      (supabase.rpc as any)("admin_overview_stats"),
      supabase
        .from("trades")
        .select("id, market_id, user_id, side, outcome, quantity, price, cost_cents, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("admin_alerts")
        .select("id, kind, severity, payload, created_at")
        .eq("acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("markets")
        .select("id, slug, question, yes_price, volume_cents, trader_count, status")
        .eq("status", "open")
        .order("volume_cents", { ascending: false })
        .limit(10),
      supabase
        .from("trending_keywords")
        .select("keyword, trend_score, mentions_1h, mentions_prev_1h, velocity, avg_sentiment, lifecycle, category")
        .order("trend_score", { ascending: false })
        .limit(12),
      supabase
        .from("source_health")
        .select("source, status, articles_24h, last_success_at, consecutive_failures")
        .order("source"),
      supabase.from("raw_news_data").select("id", { count: "exact", head: true }).gte("published_at", since24h),
      supabase.from("raw_news_data").select("id", { count: "exact", head: true }).gte("published_at", since24h).eq("processed", true),
      supabase.from("raw_news_data").select("id", { count: "exact", head: true }).eq("processed", false),
      supabase.from("raw_news_data").select("id", { count: "exact", head: true }).eq("processed", false).gte("analyze_attempts", 3),
      supabase.from("trending_keywords").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    setStats((statsRes.data as Stats) ?? null);
    setAlerts((alertsRes.data as Alert[]) ?? []);
    setMarkets((marketsRes.data as Market[]) ?? []);
    setKeywords((keywordsRes.data as Keyword[]) ?? []);
    setSources((sourcesRes.data as SourceRow[]) ?? []);
    setPipe({
      total_24h: total24Res.count ?? 0,
      processed_24h: processedRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      failed: failedRes.count ?? 0,
      last_trend_at: (lastTrendRes.data as { updated_at?: string } | null)?.updated_at ?? null,
    });

    // Hydrate trades with market and user labels
    const tradeRows = (tradesRes.data as Trade[]) ?? [];
    const marketIds = [...new Set(tradeRows.map((t) => t.market_id))];
    const userIds = [...new Set(tradeRows.map((t) => t.user_id))];
    const [mktLabels, usrLabels] = await Promise.all([
      marketIds.length
        ? supabase.from("markets").select("id, question").in("id", marketIds)
        : Promise.resolve({ data: [] as { id: string; question: string }[] }),
      userIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    ]);
    const mktMap = new Map((mktLabels.data ?? []).map((m: any) => [m.id, m.question]));
    const usrMap = new Map((usrLabels.data ?? []).map((u: any) => [u.id, u.display_name]));
    setTrades(
      tradeRows.map((t) => ({
        ...t,
        market_question: mktMap.get(t.market_id) ?? "—",
        user_name: usrMap.get(t.user_id) ?? t.user_id.slice(0, 6),
      })),
    );
  };

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 15_000);
    return () => clearInterval(id);
  }, []);

  // Realtime trade tape
  useEffect(() => {
    const channel = supabase
      .channel("admin-terminal-trades")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        async (payload) => {
          const t = payload.new as Trade;
          const [m, u] = await Promise.all([
            supabase.from("markets").select("question").eq("id", t.market_id).maybeSingle(),
            supabase.from("profiles").select("display_name").eq("id", t.user_id).maybeSingle(),
          ]);
          setTrades((prev) => [
            { ...t, market_question: m.data?.question ?? "—", user_name: u.data?.display_name ?? t.user_id.slice(0, 6) },
            ...prev,
          ].slice(0, 50));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_alerts" },
        (payload) => setAlerts((prev) => [payload.new as Alert, ...prev].slice(0, 20)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const ackAlert = async (id: string) => {
    await supabase.from("admin_alerts").update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const pulse = Math.floor(now / 1000) % 2 === 0;

  return (
    <div className="min-h-screen bg-[#06070C] text-foreground p-3 sm:p-4 font-mono text-[13px]">
      {/* Top KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-3">
        <Kpi to="/admin/users" label="USERS" value={stats?.total_users ?? 0} icon={Users} tone="text-primary" />
        <Kpi to="/admin/users" label="ACTIVE 24H" value={stats?.active_users_24h ?? 0} icon={Activity} tone="text-success" />
        <Kpi to="/admin/trades" label="TRADES 24H" value={stats?.trades_24h ?? 0} icon={TrendingUp} tone="text-success" />
        <Kpi to="/admin/trades" label="VOL 24H" value={formatKESCompact(stats?.volume_24h_cents ?? 0)} icon={Wallet} tone="text-warning" />
        <Kpi to="/admin/markets" label="LIQUIDITY" value={`KSh ${(stats?.total_liquidity_kes ?? 0).toLocaleString()}`} icon={Droplets} tone="text-accent" />
        <Kpi to="/admin/markets" label="MARKETS" value={stats?.active_markets ?? 0} icon={BarChart3} tone="text-primary" />
        <Kpi to="/admin/alerts" label="ALERTS" value={stats?.open_alerts ?? 0} icon={AlertTriangle} tone="text-destructive" pulsing={pulse && (stats?.open_alerts ?? 0) > 0} />
        <Kpi to="/admin/support" label="TICKETS" value={stats?.open_tickets ?? 0} icon={LifeBuoy} tone="text-warning" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* Live Trades Tape */}
        <Panel title="LIVE TRADES" subtitle="Realtime" className="col-span-12 lg:col-span-8 h-[340px]">
          <div className="overflow-y-auto h-full">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#0B0D14] text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left p-2 font-normal">Time</th>
                  <th className="text-left p-2 font-normal">User</th>
                  <th className="text-left p-2 font-normal">Side</th>
                  <th className="text-left p-2 font-normal">Outcome</th>
                  <th className="text-left p-2 font-normal max-w-[280px]">Market</th>
                  <th className="text-right p-2 font-normal">Qty</th>
                  <th className="text-right p-2 font-normal">Px</th>
                  <th className="text-right p-2 font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={8} className="text-center p-6 text-muted-foreground">No trades yet</td></tr>
                ) : trades.map((t) => (
                  <tr key={t.id} className="border-t border-border/30 hover:bg-card/50 transition">
                    <td className="p-2 text-muted-foreground">{new Date(t.created_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                    <td className="p-2 truncate max-w-[120px]">
                      <Link to="/u/$userId" params={{ userId: t.user_id }} className="hover:text-primary">{t.user_name}</Link>
                    </td>
                    <td className={cn("p-2", t.side === "BUY" ? "text-success" : "text-destructive")}>{t.side}</td>
                    <td className="p-2 uppercase text-muted-foreground">{t.outcome}</td>
                    <td className="p-2 truncate max-w-[280px] text-muted-foreground">{t.market_question}</td>
                    <td className="p-2 text-right">{t.quantity}</td>
                    <td className="p-2 text-right">{Number(t.price).toFixed(2)}</td>
                    <td className="p-2 text-right text-warning">{formatKES(t.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Alerts */}
        <Panel title="ALERTS" subtitle={`${alerts.length} open`} className="col-span-12 lg:col-span-4 h-[340px]">
          <div className="overflow-y-auto h-full">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">All clear</div>
            ) : alerts.map((a) => (
              <div key={a.id} className={cn("border-l-2 px-3 py-2 mb-1 text-[11px]", SEV_COLOR[a.severity] ?? SEV_COLOR.info)}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold uppercase tracking-wide">{a.kind.replace(/_/g, " ")}</div>
                    <div className="text-muted-foreground truncate text-[10px]">
                      {a.payload ? JSON.stringify(a.payload).slice(0, 80) : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(a.created_at)}</div>
                  </div>
                  <button onClick={() => ackAlert(a.id)} className="text-[10px] underline text-muted-foreground hover:text-foreground shrink-0">ACK</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Market Board */}
        <Panel title="MARKET BOARD" subtitle="Top by 24h volume" className="col-span-12 lg:col-span-7 h-[340px]">
          <div className="overflow-y-auto h-full">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#0B0D14] text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left p-2 font-normal">Market</th>
                  <th className="text-right p-2 font-normal">YES</th>
                  <th className="text-right p-2 font-normal">Vol</th>
                  <th className="text-right p-2 font-normal">Traders</th>
                </tr>
              </thead>
              <tbody>
                {markets.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-6 text-muted-foreground">No open markets</td></tr>
                ) : markets.map((m) => {
                  const yes = Number(m.yes_price);
                  return (
                    <tr key={m.id} className="border-t border-border/30 hover:bg-card/50 transition">
                      <td className="p-2 truncate max-w-[300px]">
                        <Link to="/markets/$slug" params={{ slug: m.slug }} search={{}} className="hover:text-primary">{m.question}</Link>
                      </td>
                      <td className={cn("p-2 text-right tabular-nums", yes >= 0.5 ? "text-success" : "text-destructive")}>
                        {(yes * 100).toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-warning tabular-nums">{formatKESCompact(m.volume_cents)}</td>
                      <td className="p-2 text-right text-muted-foreground">{m.trader_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Signal Monitor */}
        <Panel title="SIGNAL MONITOR" subtitle="Trending now" className="col-span-12 lg:col-span-5 h-[340px]">
          <div className="overflow-y-auto h-full">
            {keywords.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">No signals yet — wait for analyzer to populate</div>
            ) : (
              <div className="divide-y divide-border/30">
                {keywords.map((k) => {
                  const sentNorm = (Number(k.avg_sentiment) + 1) / 2; // 0..1
                  const totalMentions = (k.mentions_1h ?? 0) + (k.mentions_prev_1h ?? 0);
                  return (
                    <div key={k.keyword} className="p-2 flex items-center gap-2 hover:bg-card/50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{k.keyword}</span>
                          <span className={cn("text-[9px] uppercase px-1.5 py-0.5 border rounded", lifecyclePill(k.lifecycle))}>{k.lifecycle}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-1 flex-1 bg-muted rounded overflow-hidden">
                            <div className={cn("h-full", sentNorm >= 0.5 ? "bg-success" : "bg-destructive")} style={{ width: `${sentNorm * 100}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{totalMentions} mentions · v{Number(k.velocity).toFixed(1)}</span>
                        </div>
                      </div>
                      <span className="text-[11px] tabular-nums text-warning">{Number(k.trend_score).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        {/* System Health */}
        <Panel title="SYSTEM HEALTH" subtitle="Pipeline & sources" className="col-span-12 h-[280px]">
          <div className="grid grid-cols-12 gap-3 h-full">
            <div className="col-span-12 md:col-span-4 border-r border-border/30 pr-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Pipeline</div>
              <div className="grid grid-cols-2 gap-2">
                <PipeStat label="Articles 24h" value={pipe?.total_24h ?? 0} tone="text-foreground" />
                <PipeStat label="Processed" value={pipe?.processed_24h ?? 0} tone="text-success" />
                <PipeStat label="Pending" value={pipe?.pending ?? 0} tone={(pipe?.pending ?? 0) > 100 ? "text-warning" : "text-muted-foreground"} />
                <PipeStat label="Failed" value={pipe?.failed ?? 0} tone={(pipe?.failed ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"} />
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground">
                Last trend update: <span className="text-foreground">{timeAgo(pipe?.last_trend_at ?? null)}</span>
              </div>
              <Link to="/admin/health" className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <HeartPulse className="h-3 w-3" /> Full health view
              </Link>
            </div>
            <div className="col-span-12 md:col-span-8 overflow-y-auto">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Sources</div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-1">
                {sources.map((s) => (
                  <div key={s.source} className="flex items-center gap-2 px-2 py-1.5 border border-border/30 rounded text-[11px]">
                    {s.status === "active" ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      : s.status === "stale" ? <Circle className="h-3 w-3 text-warning shrink-0" />
                      : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                    <span className="truncate flex-1">{s.source}</span>
                    <span className="text-muted-foreground tabular-nums">{s.articles_24h}</span>
                  </div>
                ))}
                {sources.length === 0 && <div className="text-muted-foreground text-xs col-span-full">No source data yet</div>}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground flex items-center gap-2">
        <Radio className={cn("h-3 w-3", pulse ? "text-success" : "text-success/40")} />
        TERMINAL · refresh 15s · realtime trades + alerts
      </div>
    </div>
  );
}

function Panel({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("border border-border/40 bg-[#0B0D14] rounded-sm flex flex-col", className)}>
      <div className="border-b border-border/40 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">{title}</span>
        {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone, to, pulsing }: { label: string; value: number | string; icon: any; tone: string; to: any; pulsing?: boolean }) {
  return (
    <Link to={to} className={cn("border border-border/40 bg-[#0B0D14] rounded-sm px-3 py-2 hover:border-primary/40 transition group", pulsing && "animate-pulse")}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={cn("h-3 w-3", tone)} />
      </div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums truncate", tone)}>{value}</div>
    </Link>
  );
}

function PipeStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border border-border/30 rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", tone)}>{value.toLocaleString()}</div>
    </div>
  );
}
