import { createFileRoute, Link } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Loader2, CheckCircle2, Trash2, Pause, Play, Droplets, Pencil, ImageIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/markets/")({
  component: AdminMarketsList,
});

interface MarketRow {
  id: string; question: string; slug: string; category: string;
  status: string; market_type: "binary" | "multi";
  yes_price: number; volume_cents: number; liquidity_b: number; trader_count: number;
  image_url: string | null;
}

function AdminMarketsList() {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [liqMarket, setLiqMarket] = useState<MarketRow | null>(null);
  const [newB, setNewB] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("markets")
      .select("id, question, slug, category, status, market_type, yes_price, volume_cents, liquidity_b, trader_count, image_url")
      .order("created_at", { ascending: false });
    if (error) toast.error(friendlyError(error));
    setRows((data as MarketRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Delete this market? This cannot be undone.")) return;
    const { error } = await supabase.from("markets").delete().eq("id", id);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Market deleted"); load(); }
  };

  const togglePause = async (m: MarketRow) => {
    setBusy(m.id);
    const fn = m.status === "open" ? "admin_pause_market" : "admin_resume_market";
    const { error } = await (supabase.rpc as any)(fn, { _id: m.id });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else { toast.success(m.status === "open" ? "Paused" : "Resumed"); load(); }
  };

  const adjustLiquidity = async () => {
    if (!liqMarket) return;
    const b = Number(newB);
    if (!b || b < 250) { toast.error("b must be >= 250"); return; }
    setBusy(liqMarket.id);
    const { error } = await (supabase.rpc as any)("admin_adjust_liquidity", { _market_id: liqMarket.id, _new_b: b });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Liquidity adjusted"); setLiqMarket(null); setNewB(""); load(); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
          <p className="text-sm text-muted-foreground">Pause, resume, adjust liquidity, resolve, or delete markets.</p>
        </div>
        <Link to="/admin/markets/create" search={{ question: undefined, category: undefined, yes: undefined, closes: undefined, from: undefined }}>
          <Button className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="h-4 w-4 mr-1" /> Create market
          </Button>
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No markets yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Question</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">YES</th>
                  <th className="text-right p-3">Liq (b)</th>
                  <th className="text-right p-3">Traders</th>
                  <th className="text-right p-3">Volume</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="p-3 max-w-xs">
                      <div className="flex items-center gap-2.5">
                        {r.image_url ? (
                          <img
                            src={r.image_url}
                            alt=""
                            className="h-8 w-8 rounded-md object-cover border border-border/60 shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                            <ImageIcon className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{r.question}</div>
                          <Badge variant="secondary" className="mt-1 text-[9px] uppercase">{r.market_type}</Badge>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={
                        r.status === "open" ? "border-success/40 text-success"
                        : r.status === "paused" ? "border-warning/40 text-warning"
                        : r.status === "resolved" ? "border-primary/40 text-primary"
                        : "border-muted text-muted-foreground"
                      }>{r.status}</Badge>
                    </td>
                    <td className="p-3 text-right font-mono text-success">
                      {r.market_type === "multi" ? "—" : `KSh ${(Number(r.yes_price) * 100).toFixed(0)}`}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{Number(r.liquidity_b).toFixed(0)}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{r.trader_count}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{(r.volume_cents / 100).toLocaleString()}</td>
                    <td className="p-3 text-right whitespace-nowrap text-xs">
                      <Link to="/admin/markets/$id/edit" params={{ id: r.id }}
                        className="inline-flex items-center text-primary hover:underline mr-3">
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Link>
                      {(r.status === "open" || r.status === "paused") && (
                        <button onClick={() => togglePause(r)} disabled={busy === r.id}
                          className="inline-flex items-center text-warning hover:underline mr-3">
                          {r.status === "open" ? <><Pause className="h-3 w-3 mr-1" />Pause</> : <><Play className="h-3 w-3 mr-1" />Resume</>}
                        </button>
                      )}
                      <button onClick={() => { setLiqMarket(r); setNewB(String(r.liquidity_b)); }}
                        className="inline-flex items-center text-accent hover:underline mr-3">
                        <Droplets className="h-3 w-3 mr-1" /> Liquidity
                      </button>
                      <Link to="/admin/markets/$id/resolve" params={{ id: r.id }}
                        className="inline-flex items-center text-success hover:underline mr-3">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                      </Link>
                      <button onClick={() => del(r.id)} className="inline-flex items-center text-destructive hover:underline">
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!liqMarket} onOpenChange={(o) => !o && setLiqMarket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust liquidity</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Current b = {liqMarket?.liquidity_b.toFixed(0)}. New b (min 250):</p>
            <Input type="number" value={newB} onChange={(e) => setNewB(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLiqMarket(null)}>Cancel</Button>
            <Button onClick={adjustLiquidity} disabled={busy === liqMarket?.id}>
              {busy === liqMarket?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
