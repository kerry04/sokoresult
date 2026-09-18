import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import { formatKES } from "@/lib/format";
import { playCashOut } from "@/lib/sound";
import { useAuth } from "@/lib/auth-context";
import {
  getUserPositions,
  previewSellShares,
  sellShares,
  type UserPosition,
  type Outcome,
} from "@/lib/market-actions";

interface Props {
  marketId: string;
  marketType: "binary" | "multi";
  /** For multi-markets: list of outcomes so we can render labels. */
  outcomeLabels?: Record<string, string>;
  /** Pre-selected outcome (from ?outcome= search param). */
  initialOutcome?: "YES" | "NO" | null;
  initialOutcomeId?: string | null;
  isClosed: boolean;
  onTraded?: () => void;
}

const SELL_PRESETS = [0.25, 0.5, 1.0];

export function SellPanel({
  marketId,
  marketType,
  outcomeLabels,
  initialOutcome,
  initialOutcomeId,
  isClosed,
  onTraded,
}: Props) {
  const { user, refreshProfile } = useAuth();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [shares, setShares] = useState<number>(0);
  const [customMode, setCustomMode] = useState(false);
  const [preview, setPreview] = useState<{ proceeds_cents: number; price_after: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const ps = await getUserPositions(marketId, user.id);
    setPositions(ps);
    setLoading(false);
    if (ps.length > 0 && !selectedKey) {
      const initial =
        (initialOutcomeId && ps.find((p) => p.outcome_id === initialOutcomeId)) ||
        (initialOutcome && ps.find((p) => p.outcome === initialOutcome)) ||
        ps[0];
      const key = initial.outcome_id ?? initial.outcome;
      setSelectedKey(key);
      setShares(initial.shares);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, marketId]);

  const selected = positions.find(
    (p) => (p.outcome_id ?? p.outcome) === selectedKey,
  );

  // Live preview
  useEffect(() => {
    if (!selected || shares < 1 || shares > selected.shares) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(async () => {
      const outcomeArg: Outcome =
        marketType === "multi" ? "CANDIDATE" : (selected.outcome as "YES" | "NO");
      const res = await previewSellShares(
        marketId,
        outcomeArg,
        selected.outcome_id,
        shares,
      );
      setPreviewing(false);
      if (!res) {
        setPreview(null);
        return;
      }
      setPreview({ proceeds_cents: res.cost_cents, price_after: res.price_after });
    }, 200);
    return () => clearTimeout(t);
  }, [marketId, marketType, selected?.id, shares]);

  const onSell = async () => {
    if (!selected || !preview) return;
    setSubmitting(true);
    try {
      const { error } = await sellShares({
        marketId,
        marketType,
        outcome: selected.outcome,
        outcomeId: selected.outcome_id,
        shares,
      });
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      await refreshProfile();
      playCashOut();
      toast.success(
        `Sold ${shares.toLocaleString()} shares for ${formatKES(preview.proceeds_cents)}`,
        { description: "Cash added to your balance." },
      );
      // Reload positions and let parent know
      setSelectedKey("");
      setShares(0);
      setPreview(null);
      await reload();
      onTraded?.();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading your positions…
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-2">
        <div className="text-sm text-muted-foreground">
          You don't own any shares in this market yet.
        </div>
        <div className="text-xs text-muted-foreground">
          Switch to <span className="font-semibold text-foreground">Buy</span> to take a position.
        </div>
      </div>
    );
  }

  const cost = selected ? selected.shares * selected.avg_price * 100 : 0;
  const valueAtAvg = selected ? shares * selected.avg_price * 100 : 0;
  const pnl = preview ? preview.proceeds_cents - valueAtAvg : 0;
  const pnlPositive = pnl >= 0;
  const tooMany = !!selected && shares > selected.shares;
  const tooFew = !!selected && shares < 1;
  const sellLabel = (p: UserPosition) => {
    if (marketType === "multi" && p.outcome_id && outcomeLabels) {
      return outcomeLabels[p.outcome_id] ?? "Outcome";
    }
    return p.outcome;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 space-y-4 sm:space-y-5">
      {/* Position picker */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Your positions</label>
        <div className="space-y-2">
          {positions.map((p) => {
            const key = p.outcome_id ?? p.outcome;
            const isSel = selectedKey === key;
            const label = sellLabel(p);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedKey(key);
                  setShares(p.shares);
                  setCustomMode(false);
                }}
                className={cn(
                  "w-full text-left rounded-xl border-2 px-4 py-3 transition flex items-center justify-between gap-3",
                  isSel
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Avg buy KSh {(p.avg_price * 100).toFixed(0)} · {p.shares.toLocaleString()} shares
                  </div>
                </div>
                <div className="font-mono text-sm text-muted-foreground">
                  {formatKES(p.shares * p.avg_price * 100)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && !isClosed && (
        <>
          {/* Quantity picker */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">How much to sell?</label>
            <div className="grid grid-cols-3 gap-2">
              {SELL_PRESETS.map((pct) => {
                const qty = Math.max(1, Math.round(selected.shares * pct));
                const active = !customMode && shares === qty;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setCustomMode(false);
                      setShares(qty);
                    }}
                    className={cn(
                      "py-2.5 rounded-lg border-2 font-mono text-sm font-semibold transition",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {pct === 1 ? "All" : `${pct * 100}%`}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className={cn(
                  "py-2.5 rounded-lg border-2 font-mono text-sm font-semibold transition col-span-3",
                  customMode
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                Custom number of shares…
              </button>
            </div>
            {customMode && (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={selected.shares}
                value={shares}
                onChange={(e) =>
                  setShares(
                    Math.max(0, Math.min(selected.shares, parseInt(e.target.value || "0", 10))),
                  )
                }
                placeholder={`Up to ${selected.shares}`}
                className="h-11 font-mono text-lg"
                autoFocus
              />
            )}
            <div className="text-xs text-muted-foreground pt-1">
              You own <span className="font-mono font-semibold text-foreground">{selected.shares.toLocaleString()}</span> shares
              · cost basis {formatKES(cost)}
            </div>
          </div>

          {/* Cash-out preview */}
          <motion.div
            key={shares}
            initial={{ opacity: 0.7, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl border border-border bg-background/40 p-4 space-y-2"
          >
            <div className="text-sm font-semibold flex items-center gap-1.5">💵 Cash out</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selling:</span>
                <span className="font-mono font-semibold">
                  {shares.toLocaleString()} shares
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">You receive:</span>
                <span className="font-mono font-semibold">
                  {previewing && !preview
                    ? "…"
                    : preview
                      ? formatKES(preview.proceeds_cents)
                      : "—"}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Profit / loss:</span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    pnlPositive ? "text-success" : "text-destructive",
                  )}
                >
                  {preview ? `${pnlPositive ? "+" : ""}${formatKES(pnl)}` : "…"}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Cash lands in your balance instantly.
            </div>
          </motion.div>

          <Button
            ref={buttonRef}
            onClick={onSell}
            disabled={submitting || !preview || tooMany || tooFew}
            className={cn(
              "w-full h-14 text-base font-bold shadow-lg ring-2 ring-offset-2 ring-offset-background transition uppercase tracking-wide",
              "bg-destructive text-destructive-foreground hover:bg-destructive/90 ring-destructive/30",
            )}
          >
            {submitting
              ? "Processing…"
              : tooFew
                ? "Pick a quantity"
                : tooMany
                  ? "More than you own"
                  : preview
                    ? `Sell ${shares.toLocaleString()} for ${formatKES(preview.proceeds_cents)}`
                    : "…"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            Selling now closes part of your position. See the{" "}
            <Link to="/learn/disclaimer" className="underline hover:text-foreground">rules</Link>.
          </p>
        </>
      )}

      {isClosed && (
        <div className="text-center text-sm text-muted-foreground py-4">
          Market closed — wait for resolution to collect winnings.
        </div>
      )}
    </div>
  );
}
