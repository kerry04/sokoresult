import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { getDraft, saveDraft, type DraftSide } from "@/lib/drafts";
import { formatKES, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TicketMarket {
  id: string;
  slug: string;
  question: string;
  yes_price: number;
  no_price: number;
}

const SHARE_PRESETS = [1, 5, 10, 25, 50];

/**
 * Professional trading ticket. Anyone can pick a side and a stake — the draft
 * is saved on-device. When BUY is pressed, anonymous users first get a full
 * order preview; only after reviewing it are they asked to sign in, and only
 * then are they pushed to the market page. Signed-in users are handed to the
 * real ticket on the market page with their draft pre-filled. Business logic
 * is identical to the original draft ticket; only the presentation changed.
 */
export function TradingTicket({
  market,
  variant = "card",
  demo = false,
  defaultSide,
}: {
  market: TicketMarket;
  variant?: "card" | "wide";
  /** Demo/preview markets have no real market page — never navigate to one. */
  demo?: boolean;
  /** Preselects the side when the ticket mounts (e.g. hero YES/NO buttons). */
  defaultSide?: DraftSide;
}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [side, setSide] = useState<DraftSide>(
    () => defaultSide ?? getDraft(market.id)?.side ?? "yes",
  );
  const [shares, setShares] = useState<number>(() => getDraft(market.id)?.shares ?? 10);
  const [hasStoredDraft, setHasStoredDraft] = useState(() => getDraft(market.id) !== null);
  const [gateOpen, setGateOpen] = useState(false);

  // Keep the draft fresh on this device so it survives the auth round-trip.
  useEffect(() => {
    const clean = Math.max(1, Math.floor(shares) || 1);
    saveDraft(market.id, { side, shares: clean });
    setHasStoredDraft(true);
  }, [market.id, side, shares]);

  const price = side === "yes" ? market.yes_price : market.no_price;
  const cleanShares = Math.max(1, Math.floor(shares) || 1);
  const grossCents = Math.round(price * 10000 * cleanShares);
  const feeCents = Math.round((grossCents * 300) / 10000);
  const totalCents = grossCents + feeCents;
  const payoutKsh = cleanShares * 100;
  const profitKsh = Math.max(0, payoutKsh - totalCents / 100);

  const buy = () => {
    if (!authLoading && user) {
      if (demo) {
        // Preview data has no market page — keep the user on the board.
        navigate({ to: "/" });
        return;
      }
      navigate({
        to: "/markets/$slug",
        params: { slug: market.slug },
        search: { side: side === "yes" ? "YES" : "NO", shares: cleanShares },
      });
    } else {
      setGateOpen(true);
    }
  };

  const yesPct = Math.round(market.yes_price * 100);
  const noPct = Math.round(market.no_price * 100);
  const isYes = side === "yes";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-card",
        variant === "wide" ? "p-4 sm:p-5" : "p-3.5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
          Trade ticket
        </span>
        {hasStoredDraft && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Draft saved
          </span>
        )}
      </div>

      {/* Position picker — selectable trading positions, not generic buttons */}
      <div role="group" aria-label="Pick a side" className="mt-3 grid grid-cols-2 gap-2">
        <PositionButton
          label="Yes"
          pct={yesPct}
          price={market.yes_price}
          tone="yes"
          selected={isYes}
          onSelect={() => setSide("yes")}
        />
        <PositionButton
          label="No"
          pct={noPct}
          price={market.no_price}
          tone="no"
          selected={!isYes}
          onSelect={() => setSide("no")}
        />
      </div>

      {/* Stake */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`shares-${market.id}`}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Shares
          </label>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {SHARE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setShares(n)}
              aria-pressed={cleanShares === n}
              className={cn(
                "h-8 min-w-[40px] rounded-md border px-2 font-nums text-[13px] font-semibold tabular-nums transition-all duration-150 hover:-translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                cleanShares === n
                  ? "border-foreground/40 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {n}
            </button>
          ))}
          <Input
            id={`shares-${market.id}`}
            type="number"
            min={1}
            inputMode="numeric"
            value={shares}
            onChange={(e) => setShares(Math.max(1, parseInt(e.target.value || "1", 10)))}
            aria-label="Custom number of shares"
            className="h-8 w-[72px] font-nums text-[13px] tabular-nums"
          />
        </div>
      </div>

      {/* Estimate */}
      <div
        className="num mt-3.5 flex items-baseline justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          Cost <span className="font-bold text-foreground">{formatKES(totalCents)}</span>
        </span>
        <span>
          Win{" "}
          <span className="font-bold text-success">KSh {payoutKsh.toLocaleString("en-KE")}</span>
          {profitKsh > 0 && (
            <span className="text-success">
              {" "}
              (+{Math.round(profitKsh).toLocaleString("en-KE")})
            </span>
          )}
        </span>
      </div>

      <Button
        type="button"
        onClick={buy}
        className={cn(
          "mt-3 min-h-[48px] w-full text-[15px] font-bold transition-all duration-150 hover:-translate-y-px active:translate-y-0",
          isYes
            ? "bg-success text-success-foreground hover:bg-success/90"
            : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        )}
      >
        Buy {isYes ? "Yes" : "No"} — {formatKES(totalCents)}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        No account needed to draft. You sign in only when you buy.
      </p>

      <BuyFlowModal
        open={gateOpen}
        onOpenChange={setGateOpen}
        market={market}
        side={side}
        shares={cleanShares}
      />
    </div>
  );
}

function PositionButton({
  label,
  pct,
  price,
  tone,
  selected,
  onSelect,
}: {
  label: string;
  pct: number;
  price: number;
  tone: "yes" | "no";
  selected: boolean;
  onSelect: () => void;
}) {
  const yes = tone === "yes";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2",
        yes ? "focus-visible:ring-success/60" : "focus-visible:ring-destructive/60",
        selected
          ? yes
            ? "border-success/70 bg-success/[0.08] shadow-[0_0_16px_-6px_var(--color-success)]"
            : "border-destructive/70 bg-destructive/[0.08] shadow-[0_0_16px_-6px_var(--color-destructive)]"
          : "border-border bg-background/40 hover:border-muted-foreground/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]",
            yes ? "text-success" : "text-destructive",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              yes ? "bg-success" : "bg-destructive",
              selected && "animate-pulse",
            )}
            aria-hidden
          />
          {label}
        </span>
        <span
          className={cn(
            "num text-sm font-bold tabular-nums",
            yes ? "text-success" : "text-destructive",
          )}
        >
          {pct}%
        </span>
      </div>
      <div className="num mt-1 text-[13px] font-semibold tabular-nums text-muted-foreground">
        {formatPrice(price)}
      </div>
    </button>
  );
}

/**
 * Two-step buy flow for anonymous users: first a full order preview, then —
 * only after they review it — the sign-in prompt that pushes them onward.
 */
function BuyFlowModal({
  open,
  onOpenChange,
  market,
  side,
  shares,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  market: TicketMarket;
  side: DraftSide;
  shares: number;
}) {
  const [step, setStep] = useState<"preview" | "auth">("preview");
  const isYes = side === "yes";

  const price = isYes ? market.yes_price : market.no_price;
  const grossCents = Math.round(price * 10000 * shares);
  const feeCents = Math.round((grossCents * 300) / 10000);
  const totalCents = grossCents + feeCents;
  const payoutKsh = shares * 100;
  const profitKsh = Math.max(0, payoutKsh - totalCents / 100);

  const close = (v: boolean) => {
    onOpenChange(v);
    // Reset to the preview step after the close animation, so the next
    // open always starts at the order review.
    if (!v) window.setTimeout(() => setStep("preview"), 250);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {step === "preview" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Review your trade</DialogTitle>
              <DialogDescription>
                Check the numbers before you continue — no account needed to look.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{market.question}</p>

              <div className="num mt-3 space-y-1.5 text-sm tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Position</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                        isYes ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {side}
                    </span>
                    <span className="text-muted-foreground">@ {formatPrice(price)}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Shares</span>
                  <span className="font-semibold">{shares}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatKES(grossCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee (3%)</span>
                  <span className="font-semibold">{formatKES(feeCents)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="font-semibold">Total cost</span>
                  <span className="text-base font-extrabold">{formatKES(totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">If {isYes ? "Yes" : "No"} wins</span>
                  <span className="font-bold text-success">
                    KSh {payoutKsh.toLocaleString("en-KE")}
                    {profitKsh > 0 && (
                      <span> (+{Math.round(profitKsh).toLocaleString("en-KE")})</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={() => setStep("auth")}
              className="min-h-[48px] w-full bg-success font-bold text-success-foreground hover:bg-success/90"
            >
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              You'll sign in only when you place the trade. Your draft stays saved on this device.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Your prediction is ready</DialogTitle>
              <DialogDescription>
                Create a free account or log in to place it. Your draft stays saved on this device.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{market.question}</p>
              <div className="num mt-2.5 flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                    isYes ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                  )}
                >
                  {side}
                </span>
                <span className="text-muted-foreground">
                  {shares} {shares === 1 ? "share" : "shares"}
                </span>
                <span className="ml-auto font-bold text-foreground">{formatKES(totalCents)}</span>
              </div>
            </div>

            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>· Free demo account with KSh 10,000 to practice</li>
              <li>· No card required to start</li>
            </ul>

            <div className="flex flex-col gap-2.5">
              <Button
                asChild
                size="lg"
                className="min-h-[48px] bg-success font-bold text-success-foreground hover:bg-success/90"
              >
                <Link to="/signup" search={{ redirect: "/" }}>
                  Create free account <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-[48px]">
                <Link to="/login" search={{ redirect: "/" }}>
                  Log in
                </Link>
              </Button>
              <button
                type="button"
                onClick={() => setStep("preview")}
                className="mx-auto text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Back to review
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
