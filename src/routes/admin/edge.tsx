import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getEdgeOpportunities,
  updateQuantParams,
  type EdgeRow,
} from "@/lib/quant.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Settings2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatKES, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/admin/edge")({
  head: () => ({ meta: [{ title: "Edge Opportunities — Admin" }] }),
  component: EdgePage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8 max-w-xl mx-auto text-center">
      <h2 className="text-lg font-semibold mb-2">Couldn't load edge opportunities</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {typeof error?.message === "string" && error.message && !error.message.includes("[object")
          ? error.message
          : "The recommendation engine is temporarily unavailable. Make sure you're signed in as an admin and try again."}
      </p>
      <button onClick={reset} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">Retry</button>
    </div>
  ),
});

interface Params {
  quant_alpha: number;
  quant_lambda_per_hour: number;
  quant_edge_threshold: number;
  quant_kelly_fraction: number;
  quant_min_confidence: number;
  quant_recommend_bankroll_kes: number;
}

function EdgePage() {
  const fetchEdges = useServerFn(getEdgeOpportunities);
  const saveParams = useServerFn(updateQuantParams);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EdgeRow[]>([]);
  const [params, setParams] = useState<Params | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [draft, setDraft] = useState<Params | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchEdges();
      setRows(Array.isArray(r?.opportunities) ? r.opportunities : []);
      if (r?.params) {
        setParams(r.params as Params);
        if (!draft) setDraft(r.params as Params);
      }
      setRefreshedAt(new Date());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load edge opportunities");
    } finally {
      setLoading(false);
    }
  }, [fetchEdges, draft]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveParams({ data: draft });
      toast.success("Parameters updated");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const qualifying = rows.filter((r) => r.action !== "HOLD");

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Edge Opportunities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bayesian posterior vs market price, Kelly-sized — recommendations
            only.
            {refreshedAt && (
              <span className="ml-2">
                Updated {refreshedAt.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowParams((s) => !s)}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Parameters
            {showParams ? (
              <ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-1" />
            )}
          </Button>
          <Button onClick={load} disabled={loading} size="sm">
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recompute
          </Button>
        </div>
      </div>

      {showParams && draft && (
        <Card className="p-4 mb-6 bg-card/40">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ParamInput
              label="α (sentiment scale)"
              hint="L = exp(α·s). Higher = stronger sentiment impact"
              value={draft.quant_alpha}
              step={0.1}
              onChange={(v) => setDraft({ ...draft, quant_alpha: v })}
            />
            <ParamInput
              label="λ (decay /hour)"
              hint="s_eff = s·exp(-λ·Δt). 0.05 ≈ half-life 14h"
              value={draft.quant_lambda_per_hour}
              step={0.01}
              onChange={(v) =>
                setDraft({ ...draft, quant_lambda_per_hour: v })
              }
            />
            <ParamInput
              label="Edge threshold"
              hint="Min |P_model − P_market| to recommend"
              value={draft.quant_edge_threshold}
              step={0.005}
              onChange={(v) =>
                setDraft({ ...draft, quant_edge_threshold: v })
              }
            />
            <ParamInput
              label="Kelly fraction"
              hint="Fraction of full Kelly. 0.25 = quarter-Kelly (conservative)"
              value={draft.quant_kelly_fraction}
              step={0.05}
              onChange={(v) =>
                setDraft({ ...draft, quant_kelly_fraction: v })
              }
            />
            <ParamInput
              label="Min confidence"
              hint="Skip signals below this confidence"
              value={draft.quant_min_confidence}
              step={0.05}
              onChange={(v) =>
                setDraft({ ...draft, quant_min_confidence: v })
              }
            />
            <ParamInput
              label="Bankroll (KSh)"
              hint="Reference bankroll for sizing"
              value={draft.quant_recommend_bankroll_kes}
              step={1000}
              onChange={(v) =>
                setDraft({ ...draft, quant_recommend_bankroll_kes: v })
              }
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(params)}
              disabled={saving}
            >
              Reset
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save & recompute
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Open binary markets" value={rows.length} />
        <StatCard
          label="Qualifying edges"
          value={qualifying.length}
          accent={qualifying.length > 0}
        />
        <StatCard
          label="Largest |edge|"
          value={
            qualifying[0]
              ? `${(Math.abs(qualifying[0].edge) * 100).toFixed(1)}%`
              : "—"
          }
        />
        <StatCard
          label="Total recommended"
          value={formatKES(
            qualifying.reduce((s, r) => s + r.bet_kes, 0) * 100,
          )}
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Computing edges…
        </div>
      ) : qualifying.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No qualifying edges right now. Try lowering the threshold or
          minimum confidence.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Market</th>
                  <th className="text-right px-3 py-3">P_market</th>
                  <th className="text-right px-3 py-3">P_model</th>
                  <th className="text-right px-3 py-3">Edge</th>
                  <th className="text-right px-3 py-3">Conf.</th>
                  <th className="text-right px-3 py-3">Sentiment (eff.)</th>
                  <th className="text-right px-3 py-3">Bet</th>
                  <th className="text-center px-3 py-3">Side</th>
                  <th className="text-right px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {qualifying.map((r) => (
                  <tr
                    key={r.market_id}
                    className="border-t border-border/40 hover:bg-accent/20"
                  >
                    <td className="px-4 py-3 max-w-[320px]">
                      <div className="truncate font-medium">{r.question}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {r.category} · b={Math.round(r.liquidity_b)}
                      </div>
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums">
                      {formatPercent(r.yes_price)}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums">
                      {formatPercent(r.p_model)}
                    </td>
                    <td
                      className={cn(
                        "text-right px-3 py-3 tabular-nums font-semibold",
                        r.edge > 0 ? "text-emerald-500" : "text-rose-500",
                      )}
                    >
                      {r.edge > 0 ? "+" : ""}
                      {(r.edge * 100).toFixed(2)}%
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums">
                      {(r.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-muted-foreground">
                      {r.s_effective >= 0 ? "+" : ""}
                      {r.s_effective.toFixed(2)}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums font-medium">
                      KSh {r.bet_kes.toLocaleString()}
                    </td>
                    <td className="text-center px-3 py-3">
                      <Badge
                        className={cn(
                          "font-mono",
                          r.side === "YES"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border-rose-500/30",
                        )}
                      >
                        {r.side === "YES" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        BUY {r.side}
                      </Badge>
                    </td>
                    <td className="text-right px-3 py-3">
                      <Link
                        to="/markets/$slug"
                        params={{ slug: r.slug }}
                        search={{ side: r.side, amount: r.bet_kes } as any}
                      >
                        <Button size="sm" variant="outline">
                          Open →
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-8 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Method:</strong> Bayesian update in logit space —
          logit(P_model) = logit(P_market) + α·s_eff, where s_eff =
          avg_sentiment · exp(-λ · age). Bet sizing uses fractional Kelly
          capped at 5% of bankroll.
        </p>
        <p>
          Recommendations are advisory. No trades are placed automatically —
          click <strong>Open →</strong> to review and execute through the
          normal trade panel.
        </p>
      </div>
    </div>
  );
}

function ParamInput({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1"
      />
      <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className={cn("p-4", accent && "border-primary/40 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
