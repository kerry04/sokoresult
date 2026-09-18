import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { timeAgo } from "@/components/admin/news/types";

export const Route = createFileRoute("/admin/health")({
  component: AdminHealth,
});

interface Source {
  source: string;
  status: string;
  last_fetch_at: string | null;
  last_success_at: string | null;
  articles_24h: number;
  consecutive_failures: number;
  last_error: string | null;
}

function AdminHealth() {
  const [rows, setRows] = useState<Source[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, p] = await Promise.all([
        supabase.from("source_health").select("*").order("source"),
        supabase.from("raw_news_data").select("id", { count: "exact", head: true }).eq("processed", false),
      ]);
      setRows((s.data as Source[]) ?? []);
      setPending(p.count ?? 0);
      setLoading(false);
    })();
  }, []);

  const Icon = (s: string) =>
    s === "active" ? <CheckCircle2 className="h-4 w-4 text-success" />
      : s === "stale" ? <AlertCircle className="h-4 w-4 text-warning" />
      : <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System health</h1>
        <p className="text-sm text-muted-foreground">Scrapers, ingestion, and sentiment processing.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Sources active</div>
          <div className="mt-2 font-mono text-2xl font-bold text-success">{rows.filter((r) => r.status === "active").length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Sources stale</div>
          <div className="mt-2 font-mono text-2xl font-bold text-warning">{rows.filter((r) => r.status === "stale").length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Sources down</div>
          <div className="mt-2 font-mono text-2xl font-bold text-destructive">{rows.filter((r) => r.status === "down").length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Unprocessed news</div>
          <div className="mt-2 font-mono text-2xl font-bold text-warning">{pending}</div>
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
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Articles 24h</th>
                  <th className="text-right p-3">Last success</th>
                  <th className="text-right p-3">Failures</th>
                  <th className="text-left p-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.source} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{r.source}</td>
                    <td className="p-3 flex items-center gap-2">{Icon(r.status)}<span className="capitalize">{r.status}</span></td>
                    <td className="p-3 text-right font-mono">{r.articles_24h}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{timeAgo(r.last_success_at)}</td>
                    <td className="p-3 text-right font-mono">{r.consecutive_failures}</td>
                    <td className="p-3 text-xs text-destructive max-w-xs truncate">{r.last_error ?? "—"}</td>
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
