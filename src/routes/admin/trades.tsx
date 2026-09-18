import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { formatKES } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/trades")({
  component: AdminTrades,
});

interface TradeRow {
  id: string;
  created_at: string;
  user_id: string;
  display_name: string | null;
  market_id: string;
  question: string;
  outcome: string;
  side: string;
  quantity: number;
  price: number;
  cost_cents: number;
}

function AdminTrades() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [minKes, setMinKes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_recent_trades", {
      _limit: 200,
      _user_id: userId.trim() || null,
      _market_id: marketId.trim() || null,
      _min_cents: minKes ? Math.round(Number(minKes) * 100) : 0,
    });
    if (error) toast.error(friendlyError(error));
    setRows((data as TradeRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Live subscribe to new trades; refresh on insert
  useEffect(() => {
    const ch = supabase
      .channel("admin-trades")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, marketId, minKes]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trades feed</h1>
          <p className="text-sm text-muted-foreground">Live, filterable view of every trade.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="Filter by user id" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <Input placeholder="Filter by market id" value={marketId} onChange={(e) => setMarketId(e.target.value)} />
        <Input placeholder="Min cost (KSh)" type="number" value={minKes} onChange={(e) => setMinKes(e.target.value)} />
      </div>
      <Button size="sm" onClick={load}>Apply filters</Button>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No trades.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Trader</th>
                  <th className="text-left p-3">Market</th>
                  <th className="text-left p-3">Side</th>
                  <th className="text-right p-3">Qty</th>
                  <th className="text-right p-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleTimeString("en-KE")}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{r.display_name ?? "Anon"}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{r.user_id.slice(0, 8)}…</div>
                    </td>
                    <td className="p-3 max-w-xs truncate">{r.question}</td>
                    <td className="p-3">
                      <span className={r.side === "BUY" ? "text-success" : "text-destructive"}>
                        {r.side} {r.outcome}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">{r.quantity}</td>
                    <td className="p-3 text-right font-mono text-success">{formatKES(r.cost_cents)}</td>
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
