import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/markets/$id/resolve")({
  component: ResolveMarketPage,
});

interface Market {
  id: string;
  question: string;
  category: string;
  status: string;
  market_type: "binary" | "multi";
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
}

interface Outcome {
  id: string;
  label: string;
  image_url: string | null;
  price: number;
  is_winner: boolean | null;
}

function ResolveMarketPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [market, setMarket] = useState<Market | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [confirm, setConfirm] = useState("");
  const [outcomeBin, setOutcomeBin] = useState<boolean | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("markets")
        .select(
          "id, question, category, status, market_type, yes_price, no_price, volume_cents, trader_count",
        )
        .eq("id", id)
        .maybeSingle();
      setMarket(data as Market | null);
      if (data && (data as Market).market_type === "multi") {
        const { data: os } = await supabase
          .from("market_outcomes")
          .select("id, label, image_url, price, is_winner")
          .eq("market_id", id)
          .order("price", { ascending: false });
        setOutcomes((os ?? []) as Outcome[]);
      }
    })();
  }, [id]);

  const resolve = async () => {
    if (confirm !== "RESOLVE") return;
    if (!market) return;
    setSubmitting(true);
    let error;
    if (market.market_type === "multi") {
      if (!outcomeId) {
        setSubmitting(false);
        return;
      }
      ({ error } = await supabase.rpc("resolve_multi_market", {
        _market_id: id,
        _winning_outcome_id: outcomeId,
      }));
    } else {
      if (outcomeBin === null) {
        setSubmitting(false);
        return;
      }
      ({ error } = await supabase.rpc("resolve_market", {
        _market_id: id,
        _outcome: outcomeBin,
      }));
    }
    setSubmitting(false);
    if (error) toast.error(friendlyError(error));
    else {
      toast.success("Market resolved — payouts distributed");
      navigate({ to: "/admin/markets" });
    }
  };

  if (!market) {
    return (
      <div className="p-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
      </div>
    );
  }

  if (market.status === "resolved") {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6">
          <h1 className="text-xl font-bold">This market is already resolved</h1>
          <p className="text-muted-foreground mt-1">{market.question}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate({ to: "/admin/markets" })}
          >
            ← Back to markets
          </Button>
        </div>
      </div>
    );
  }

  const ready =
    market.market_type === "multi" ? !!outcomeId : outcomeBin !== null;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resolve market</h1>
        <p className="text-sm text-muted-foreground">
          Distributes payouts to winning positions. Irreversible.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {market.category}
          </Badge>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {market.market_type}
          </Badge>
        </div>
        <h2 className="text-lg font-semibold leading-snug">{market.question}</h2>
        <div className="text-xs text-muted-foreground font-mono">
          Volume {(market.volume_cents / 100).toLocaleString()} · {market.trader_count} traders
        </div>
      </div>

      {market.market_type === "binary" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOutcomeBin(true)}
            className={cn(
              "rounded-2xl border-2 p-5 text-center transition",
              outcomeBin === true
                ? "border-success bg-success/15"
                : "border-border hover:border-success/40",
            )}
          >
            <div className="text-xs uppercase text-muted-foreground">Resolve as</div>
            <div className="text-success font-bold text-2xl">YES</div>
          </button>
          <button
            type="button"
            onClick={() => setOutcomeBin(false)}
            className={cn(
              "rounded-2xl border-2 p-5 text-center transition",
              outcomeBin === false
                ? "border-destructive bg-destructive/15"
                : "border-border hover:border-destructive/40",
            )}
          >
            <div className="text-xs uppercase text-muted-foreground">Resolve as</div>
            <div className="text-destructive font-bold text-2xl">NO</div>
          </button>
        </div>
      ) : (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Pick the winning candidate
          </div>
          <div className="space-y-2">
            {outcomes.map((o) => {
              const sel = outcomeId === o.id;
              const pct = Number(o.price) * 100;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcomeId(o.id)}
                  className={cn(
                    "w-full text-left rounded-xl border-2 p-3 flex items-center gap-3 transition",
                    sel
                      ? "border-success bg-success/10"
                      : "border-border hover:border-success/40",
                  )}
                >
                  {o.image_url ? (
                    <img
                      src={o.image_url}
                      alt={o.label}
                      className="h-10 w-10 rounded-full object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted shrink-0 flex items-center justify-center text-xs font-bold">
                      {o.label.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{o.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Final price KSh {pct.toFixed(0)}
                    </div>
                  </div>
                  {sel && (
                    <Badge className="bg-success text-success-foreground">Winner</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {ready && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5 space-y-3">
          <div className="flex items-start gap-2 text-warning">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              All winning positions will be paid out automatically. This cannot be
              undone.
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Type <span className="font-mono font-bold text-foreground">RESOLVE</span> to confirm
            </label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder="RESOLVE"
            />
          </div>
          <Button
            onClick={resolve}
            disabled={confirm !== "RESOLVE" || submitting}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Resolve market
          </Button>
        </div>
      )}
    </div>
  );
}
