import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Users2, ShieldAlert, Wifi, Fingerprint } from "lucide-react";
import { formatKES } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/syndicates")({
  component: AdminSyndicates,
});

interface Cluster {
  cluster_key: string;
  market_id: string;
  question: string;
  outcome: string;
  user_count: number;
  total_quantity: number;
  total_cost_cents: number;
  user_ids: string[];
  display_names: (string | null)[];
  shared_ip_count: number;
  shared_fingerprint_count: number;
  suspicion_score: number;
}

function suspicionColor(score: number) {
  if (score >= 0.7) return "text-destructive";
  if (score >= 0.4) return "text-warning";
  return "text-muted-foreground";
}

function AdminSyndicates() {
  const [rows, setRows] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowMin, setWindowMin] = useState(60);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_detect_syndicates", { _window_minutes: windowMin });
    if (error) toast.error(friendlyError(error));
    setRows((data as Cluster[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [windowMin]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users2 className="h-5 w-5 text-warning" /> Syndicate detection
        </h1>
        <p className="text-sm text-muted-foreground">
          Clusters of users buying the same outcome — weighted by shared IP, device fingerprint, and coordination.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {[15, 60, 240, 1440].map((m) => (
          <Button key={m} size="sm" variant={windowMin === m ? "default" : "outline"} onClick={() => setWindowMin(m)}>
            {m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : "24h"}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No suspicious clusters.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((c) => (
              <div key={c.cluster_key} className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.question}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.user_count} users · {c.total_quantity} shares · {formatKES(c.total_cost_cents)} on {c.outcome}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-semibold ${suspicionColor(c.suspicion_score)}`}>
                    <ShieldAlert className="h-4 w-4" />
                    {(c.suspicion_score * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> {c.shared_ip_count} shared IP{c.shared_ip_count === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><Fingerprint className="h-3 w-3" /> {c.shared_fingerprint_count} shared device{c.shared_fingerprint_count === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.display_names.map((n, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted/40">
                      {n ?? "Anon"} · {c.user_ids[i]?.slice(0, 6)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
