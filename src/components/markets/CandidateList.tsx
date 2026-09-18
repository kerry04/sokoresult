import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { VerificationGateModal, FirstTradeWarning } from "@/components/markets/VerificationGateModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { formatKES } from "@/lib/format";
import { fireConfettiAt } from "@/components/engagement/ConfettiBurst";
import { playChaChing } from "@/lib/sound";
import { recordTradeEngagement } from "@/lib/engagement";

const FIRST_TRADE_KEY = "soko-first-trade-ack";
const PRESET_SHARES = [1, 5, 10, 25, 50, 100];

export interface OutcomeRow {
  id: string;
  label: string;
  image_url: string | null;
  price: number;
  sort_order: number;
}

interface Props {
  marketId: string;
  outcomes: OutcomeRow[];
  balance: number;
  status: string;
}

const PALETTE = [
  "oklch(0.78 0.22 150)",
  "oklch(0.7 0.22 30)",
  "oklch(0.7 0.2 260)",
  "oklch(0.8 0.2 80)",
  "oklch(0.7 0.22 320)",
  "oklch(0.75 0.18 200)",
  "oklch(0.72 0.2 0)",
  "oklch(0.78 0.18 110)",
];

export function CandidateList({ marketId, outcomes, balance, status }: Props) {
  const sorted = [...outcomes].sort((a, b) => Number(b.price) - Number(a.price));
  const [selectedId, setSelectedId] = useState<string>(sorted[0]?.id ?? "");
  const [shares, setShares] = useState<number>(10);
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [firstTradeOpen, setFirstTradeOpen] = useState(false);
  const { user, profile, refreshProfile, enqueueAchievements } = useAuth();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mountedAtRef = useRef<number>(Date.now());

  const selected = sorted.find((o) => o.id === selectedId) ?? sorted[0];
  const price = selected ? Number(selected.price) : 0;
  const priceKsh = price * 100;
  const isClosed = status !== "open";

  const grossCents = Math.round(price * 10000 * shares);
  const feeCents = Math.round((grossCents * 300) / 10000);
  const totalCents = grossCents + feeCents;
  const totalKsh = Math.round(totalCents / 100);
  const payoutKsh = shares * 100;
  const profitKsh = Math.max(0, payoutKsh - totalKsh);

  const executeBuy = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase.rpc as any)("execute_lmsr_trade_multi", {
        _market_id: marketId,
        _outcome_id: selected.id,
        _side: "BUY",
        _quantity: shares,
      });
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      await refreshProfile();
      toast.success(`Bought ${shares} shares of ${selected.label}`, {
        description: "Trade executed. Balance updated.",
      });
      playChaChing();
      fireConfettiAt(buttonRef.current);
      const secs = Math.floor((Date.now() - mountedAtRef.current) / 1000);
      const eng = await recordTradeEngagement(marketId, null, secs);
      if (eng?.newAchievements?.length) await enqueueAchievements(eng.newAchievements);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const buy = async () => {
    if (!user) {
      toast.error("Sign in to trade");
      return;
    }
    if (isClosed) {
      toast.error("This market is closed");
      return;
    }
    if (shares < 1) {
      toast.error("Pick at least 1 share");
      return;
    }
    if (totalCents > balance) {
      toast.error("Not enough balance");
      return;
    }
    if ((profile?.kyc_tier ?? 0) < 1) {
      setGateOpen(true);
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(FIRST_TRADE_KEY) !== "1") {
      setFirstTradeOpen(true);
      return;
    }
    await executeBuy();
  };

  const notEnough = totalCents > balance;
  const selectedColor = selected ? PALETTE[sorted.indexOf(selected) % PALETTE.length] : PALETTE[0];
  const MIN_PRICE = 1 / 10;
  const longshot = price > 0 && price < MIN_PRICE;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Candidate picker */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
        <h3 className="font-semibold mb-3 sm:mb-4">Pick a candidate</h3>
        <div className="space-y-2">
          {sorted.map((o, idx) => {
            const pct = Number(o.price) * 100;
            const isSel = selectedId === o.id;
            const color = PALETTE[idx % PALETTE.length];
            const oLongshot = Number(o.price) > 0 && Number(o.price) < MIN_PRICE;
            return (
              <button
                key={o.id}
                onClick={() => !oLongshot && setSelectedId(o.id)}
                disabled={oLongshot}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-2.5 sm:p-3 transition relative overflow-hidden",
                  oLongshot
                    ? "border-border opacity-50 cursor-not-allowed"
                    : isSel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                )}
              >
                <div className="absolute inset-y-0 left-0 opacity-15" style={{ width: `${pct}%`, background: color }} />
                <div className="relative flex items-center gap-2 sm:gap-3 min-w-0">
                  {o.image_url ? (
                    <img src={o.image_url} alt={o.label} className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover border border-border shrink-0" />
                  ) : (
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0 flex items-center justify-center font-bold text-background text-sm" style={{ background: color }}>
                      {o.label.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm sm:text-base">{o.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {oLongshot ? "Too unlikely" : `${pct.toFixed(0)}% chance`}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-base sm:text-lg shrink-0" style={{ color }}>
                    KSh {pct.toFixed(0)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && !isClosed && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 space-y-4 sm:space-y-5">
          {/* Shares */}
          <div className="space-y-2">
            <label className="text-sm font-semibold truncate block">
              How many shares of {selected.label}?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_SHARES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setCustomMode(false);
                    setShares(n);
                  }}
                  className={cn(
                    "py-2.5 rounded-lg border-2 font-mono text-sm font-semibold transition",
                    !customMode && shares === n
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
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
                value={shares}
                onChange={(e) => setShares(Math.max(1, parseInt(e.target.value || "1", 10)))}
                placeholder="Enter number of shares"
                className="h-11 font-mono text-lg"
                autoFocus
              />
            )}
            <div className="text-xs text-muted-foreground pt-1 flex justify-between gap-2">
              <span className="truncate">
                Price/share: <span className="font-mono font-semibold text-foreground">KSh {priceKsh.toFixed(0)}</span>
              </span>
              <span className="truncate">
                Balance: <span className="font-mono font-semibold text-foreground">{formatKES(balance)}</span>
              </span>
            </div>
          </div>

          {/* Win summary */}
          <div className="rounded-xl border border-border bg-background/40 p-3 sm:p-4 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">💰 If {selected.label} wins</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground truncate">Shares:</span>
                <span className="font-mono font-semibold">{shares.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground truncate">Total cost:</span>
                <span className="font-mono font-semibold">KSh {totalKsh.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground truncate">If correct:</span>
                <span className="font-mono font-semibold">KSh {payoutKsh.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border/60 gap-2">
                <span className="text-muted-foreground truncate">Profit:</span>
                <span className="font-mono font-bold text-success">+KSh {profitKsh.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1">Incl. 3% fee · Each share pays KSh 100 if correct</div>
          </div>

          <Button
            ref={buttonRef}
            onClick={buy}
            disabled={submitting || shares < 1 || notEnough || longshot}
            className="w-full h-14 text-sm sm:text-base font-bold shadow-lg ring-2 ring-offset-2 ring-offset-background uppercase tracking-wide"
            style={{ background: selectedColor, color: "#0a0a0a" }}
          >
            {submitting
              ? "Processing…"
              : longshot
                ? "Too unlikely to trade"
                : notEnough
                  ? `Need KSh ${(Math.ceil((totalCents - balance) / 100)).toLocaleString()} more`
                  : `Buy ${shares} for KSh ${totalKsh.toLocaleString()}`}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            By trading, you agree to the{" "}
            <Link to="/learn/disclaimer" className="underline hover:text-foreground">rules</Link>.
          </p>
        </div>
      )}

      {isClosed && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
          Market closed
        </div>
      )}

      <VerificationGateModal open={gateOpen} onOpenChange={setGateOpen} />
      <FirstTradeWarning
        open={firstTradeOpen}
        onCancel={() => setFirstTradeOpen(false)}
        onConfirm={() => {
          if (typeof window !== "undefined") localStorage.setItem(FIRST_TRADE_KEY, "1");
          setFirstTradeOpen(false);
          executeBuy();
        }}
      />
    </div>
  );
}
