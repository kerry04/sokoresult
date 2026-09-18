import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, MessageSquare, Newspaper, Zap } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/signals")({
  component: AdminSignals,
});

interface EdgeRow {
  market_id: string;
  question: string;
  market_prob: number;
  signal_prob: number;
  edge: number;
  confidence: number;
}

function AdminSignals() {
  const [keywords, setKeywords] = useState<any[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [news24h, setNews24h] = useState(0);
  const [social6h, setSocial6h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [kw, nc, sc, ed] = await Promise.all([
      supabase.from("trending_keywords").select("*").order("trend_score", { ascending: false }).limit(25),
      supabase.from("raw_news_data").select("id", { count: "exact", head: true })
        .gte("published_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
      supabase.from("social_posts").select("id", { count: "exact", head: true })
        .gte("posted_at", new Date(Date.now() - 6 * 3600_000).toISOString()),
      (supabase.rpc as any)("admin_edge_opportunities", { _limit: 20 }),
    ]);
    setKeywords(kw.data ?? []);
    setNews24h(nc.count ?? 0);
    setSocial6h(sc.count ?? 0);
    setEdges((ed.data as EdgeRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await (supabase.rpc as any)("run_signal_update_all");
    setRunning(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Processed ${data?.processed ?? 0}, applied ${data?.applied ?? 0}`);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Signal engine</h1>
          <p className="text-sm text-muted-foreground">Trending keywords, news/social volume, and signal vs market edge.</p>
        </div>
        <Button onClick={runNow} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Run signal update
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground tracking-wider">News (24h)</span><Newspaper className="h-4 w-4 text-warning" /></div>
          <div className="mt-2 font-mono text-3xl font-bold">{news24h}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground tracking-wider">Social (6h)</span><MessageSquare className="h-4 w-4 text-accent" /></div>
          <div className="mt-2 font-mono text-3xl font-bold">{social6h}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground tracking-wider">Trending keywords</span><TrendingUp className="h-4 w-4 text-success" /></div>
          <div className="mt-2 font-mono text-3xl font-bold">{keywords.length}</div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Edge opportunities</h2>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {edges.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No high-confidence edges right now.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Market</th>
                    <th className="text-right p-3">Market</th>
                    <th className="text-right p-3">Signal</th>
                    <th className="text-right p-3">Edge</th>
                    <th className="text-right p-3">Conf.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {edges.map((e) => (
                    <tr key={e.market_id} className="hover:bg-muted/20">
                      <td className="p-3 truncate max-w-md">{e.question}</td>
                      <td className="p-3 text-right font-mono">{(Number(e.market_prob) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{(Number(e.signal_prob) * 100).toFixed(1)}%</td>
                      <td className={`p-3 text-right font-mono font-semibold ${Number(e.edge) > 0 ? "text-success" : "text-destructive"}`}>
                        {(Number(e.edge) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{(Number(e.confidence) * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Keyword</th>
                  <th className="text-left p-3">Lifecycle</th>
                  <th className="text-right p-3">Score</th>
                  <th className="text-right p-3">Mentions 1h</th>
                  <th className="text-right p-3">Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keywords.map((k) => (
                  <tr key={k.keyword} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{k.keyword}</td>
                    <td className="p-3 text-muted-foreground capitalize">{k.lifecycle}</td>
                    <td className="p-3 text-right font-mono text-primary">{Number(k.trend_score).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono">{k.mentions_1h}</td>
                    <td className="p-3 text-right font-mono">
                      <span className={Number(k.avg_sentiment) > 0 ? "text-success" : Number(k.avg_sentiment) < 0 ? "text-destructive" : "text-muted-foreground"}>
                        {Number(k.avg_sentiment).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
