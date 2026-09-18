import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/alerts")({
  component: AdminAlerts,
});

interface Alert {
  id: string;
  kind: string;
  severity: string;
  user_id: string | null;
  market_id: string | null;
  payload: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

function AdminAlerts() {
  const [rows, setRows] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAck, setShowAck] = useState(false);

  const load = async () => {
    setLoading(true);
    const q = supabase.from("admin_alerts").select("*").order("created_at", { ascending: false }).limit(200);
    const { data, error } = showAck ? await q : await q.eq("acknowledged", false);
    if (error) toast.error(friendlyError(error));
    setRows((data as unknown as Alert[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showAck]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_alerts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAck]);

  const ack = async (id: string) => {
    const { error } = await (supabase.rpc as any)("admin_acknowledge_alert", { _id: id });
    if (error) toast.error(friendlyError(error));
    else { toast.success("Acknowledged"); load(); }
  };

  const sevColor = (s: string) =>
    s === "critical" ? "border-destructive/40 text-destructive"
      : s === "warn" ? "border-warning/40 text-warning"
      : "border-muted text-muted-foreground";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Alerts
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-generated for large trades, rapid trading, and price shifts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAck((v) => !v)}>
          {showAck ? "Hide acknowledged" : "Show all"}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No alerts.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((a) => (
              <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={sevColor(a.severity)}>{a.severity}</Badge>
                    <span className="font-mono text-xs uppercase tracking-wider">{a.kind}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("en-KE")}
                    </span>
                    {a.acknowledged && <Badge variant="outline" className="text-success border-success/40">acked</Badge>}
                  </div>
                  <pre className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(a.payload, null, 2)}
                  </pre>
                  <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                    {a.user_id && <>user {a.user_id.slice(0, 8)}… </>}
                    {a.market_id && <>market {a.market_id.slice(0, 8)}…</>}
                  </div>
                </div>
                {!a.acknowledged && (
                  <Button size="sm" variant="outline" onClick={() => ack(a.id)}>
                    <Check className="h-3 w-3 mr-1" /> Ack
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
