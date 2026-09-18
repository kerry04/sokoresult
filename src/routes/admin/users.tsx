import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, Search, Wallet, Flag, Ban, ShieldAlert, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

interface ProfileRow {
  id: string; display_name: string | null; phone: string | null;
  kes_balance: number; kyc_tier: number; created_at: string;
  status?: string; country?: string;
  risk_score?: number; risk_reasons?: any;
}

function AdminUsers() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statsUser, setStatsUser] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: risk }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, phone, kes_balance, kyc_tier, created_at, status, country" as any)
        .order("created_at", { ascending: false })
        .limit(200),
      (supabase.from as any)("user_risk_scores").select("user_id, score, reasons"),
    ]);
    if (error) toast.error(friendlyError(error));
    const riskMap = new Map<string, { score: number; reasons: any }>(
      ((risk as any[]) ?? []).map((r) => [r.user_id, { score: Number(r.score), reasons: r.reasons }]),
    );
    const merged = ((data as unknown as ProfileRow[]) ?? []).map((p) => ({
      ...p,
      risk_score: riskMap.get(p.id)?.score,
      risk_reasons: riskMap.get(p.id)?.reasons,
    }));
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = async (id: string, name: string) => {
    if (!confirm(`Reset ${name || "this trader"}'s balance to KES 10,000?`)) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_reset_balance", { _user_id: id, _amount_cents: 1_000_000 });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Balance reset"); load(); }
  };

  const setStatus = async (id: string, status: string) => {
    const reason = status === "active" ? null : prompt(`Reason for ${status}?`) || "";
    setBusy(id);
    const { error } = await (supabase.rpc as any)("admin_set_user_status", { _user_id: id, _status: status, _reason: reason });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else { toast.success(`User ${status}`); load(); }
  };

  const openStats = async (u: ProfileRow) => {
    setStatsUser(u); setStats(null);
    const { data } = await (supabase.rpc as any)("admin_user_stats", { _user_id: u.id });
    setStats(data);
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (r.display_name ?? "").toLowerCase().includes(s)
      || (r.phone ?? "").toLowerCase().includes(s)
      || r.id.toLowerCase().includes(s);
  });

  const statusColor = (s?: string) =>
    s === "suspended" ? "border-destructive/40 text-destructive"
    : s === "restricted" ? "border-warning/40 text-warning"
    : s === "flagged" ? "border-accent/40 text-accent"
    : "border-success/40 text-success";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Flag, restrict, suspend, or reset balances.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, phone, id…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No users.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Trader</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-center p-3">Risk</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-center p-3">KYC</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="p-3">
                      <div className="font-medium">{r.display_name ?? "Anonymous"}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {r.id.slice(0, 8)}… · {r.country ?? "—"} · {r.phone ?? "no phone"}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={statusColor(r.status)}>{r.status ?? "active"}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      {typeof r.risk_score === "number" ? (
                        <span
                          title={r.risk_reasons ? JSON.stringify(r.risk_reasons) : ""}
                          className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                            r.risk_score >= 0.7
                              ? "bg-destructive/15 text-destructive"
                              : r.risk_score >= 0.4
                              ? "bg-warning/15 text-warning"
                              : "bg-success/15 text-success"
                          }`}
                        >
                          {(r.risk_score * 100).toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-success">{formatKES(r.kes_balance)}</td>
                    <td className="p-3 text-center">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted/40">T{r.kyc_tier}</span>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-xs space-x-2">
                      <button onClick={() => openStats(r)} className="text-primary hover:underline inline-flex items-center">
                        <BarChart3 className="h-3 w-3 mr-1" />Stats
                      </button>
                      <button onClick={() => setStatus(r.id, "flagged")} disabled={busy === r.id}
                        className="text-accent hover:underline inline-flex items-center">
                        <Flag className="h-3 w-3 mr-1" />Flag
                      </button>
                      <button onClick={() => setStatus(r.id, "restricted")} disabled={busy === r.id}
                        className="text-warning hover:underline inline-flex items-center">
                        <ShieldAlert className="h-3 w-3 mr-1" />Restrict
                      </button>
                      <button onClick={() => setStatus(r.id, "suspended")} disabled={busy === r.id}
                        className="text-destructive hover:underline inline-flex items-center">
                        <Ban className="h-3 w-3 mr-1" />Suspend
                      </button>
                      {r.status && r.status !== "active" && (
                        <button onClick={() => setStatus(r.id, "active")} disabled={busy === r.id}
                          className="text-success hover:underline">Activate</button>
                      )}
                      <Button size="sm" variant="outline" disabled={busy === r.id}
                        onClick={() => reset(r.id, r.display_name ?? "")}>
                        {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        <span className="ml-1.5">Reset</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-warning/10 border border-warning/30 p-4 text-sm text-warning flex gap-3">
        <Wallet className="h-4 w-4 shrink-0 mt-0.5" />
        <div>Restricted/suspended users cannot place trades. All actions are logged in audit_events.</div>
      </div>

      <Dialog open={!!statsUser} onOpenChange={(o) => !o && setStatsUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{statsUser?.display_name ?? "Trader"} stats</DialogTitle></DialogHeader>
          {!stats ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs text-muted-foreground">Trades</div><div className="font-mono text-xl">{stats.trade_count}</div></div>
              <div><div className="text-xs text-muted-foreground">Volume</div><div className="font-mono text-xl">{formatKES(stats.volume_cents)}</div></div>
              <div><div className="text-xs text-muted-foreground">Avg trade</div><div className="font-mono text-xl">{formatKES(stats.avg_trade_cents)}</div></div>
              <div><div className="text-xs text-muted-foreground">Realized P&L</div>
                <div className={`font-mono text-xl ${stats.realized_pnl_cents >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatKES(stats.realized_pnl_cents)}
                </div></div>
              <div><div className="text-xs text-muted-foreground">Win rate</div><div className="font-mono text-xl">{stats.win_rate}%</div></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setStatsUser(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
