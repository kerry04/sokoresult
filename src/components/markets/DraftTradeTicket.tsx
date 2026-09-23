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
 * Public trade ticket. Anyone can pick a side and a stake — the draft is
 * saved on-device, and the sign-in prompt only appears when BUY is pressed.
 * Signed-in users are handed to the real ticket on the market page with
 * their draft pre-filled.
 */
export function DraftTradeTicket({
  market,
  variant = "card",
}: {
  market: TicketMarket;
  variant?: "card" | "wide";
}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [side, setSide] = useState<DraftSide>(() => getDraft(market.id)?.side ?? "yes");
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

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background/40",
        variant === "wide" ? "p-4 sm:p-5" : "mt-4 p-3",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your prediction
        </span>
        {hasStoredDraft && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/90">
            Draft saved
          </span>
        )}
      </div>

      {/* Side picker */}
      <div
        role="group"
        aria-label="Pick a side"
        className={cn("grid grid-cols-2 gap-2", variant === "wide" ? "mt-3" : "mt-2.5")}
      >
        <button
          type="button"
          onClick={() => setSide("yes")}
          aria-pressed={side === "yes"}
          className={cn(
            "rounded-lg border-2 px-3 py-2.5 text-left transition min-h-[56px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
            side === "yes"
              ? "border-success bg-success/10 ring-2 ring-success/30"
              : "border-border bg-background/40 hover:border-success/50",
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-success">Yes</div>
          <div className="num mt-0.5 text-base font-bold text-success">
            {yesPct}%{" "}
            <span className="text-xs font-medium text-muted-foreground">
              · {formatPrice(market.yes_price)}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSide("no")}
          aria-pressed={side === "no"}
          className={cn(
            "rounded-lg border-2 px-3 py-2.5 text-left transition min-h-[56px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60",
            side === "no"
              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
              : "border-border bg-background/40 hover:border-destructive/50",
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-destructive">No</div>
          <div className="num mt-0.5 text-base font-bold text-destructive">
            {noPct}%{" "}
            <span className="text-xs font-medium text-muted-foreground">
              · {formatPrice(market.no_price)}
            </span>
          </div>
        </button>
      </div>

      {/* Stake */}
      <div className="mt-3">
        <label
          htmlFor={`shares-${market.id}`}
          className="text-xs font-semibold text-muted-foreground"
        >
          Shares
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {SHARE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setShares(n)}
              aria-pressed={cleanShares === n}
              className={cn(
                "h-9 min-w-[44px] rounded-lg border px-2.5 font-mono text-sm font-semibold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                cleanShares === n
                  ? "border-success/60 bg-success/10 text-foreground"
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
            className="h-9 w-20 font-mono text-sm"
          />
        </div>
      </div>

      {/* Estimate */}
      <p className="num mt-3 text-xs text-muted-foreground" aria-live="polite">
        Est. cost <span className="font-semibold text-foreground">{formatKES(totalCents)}</span>
        {" · "}win{" "}
        <span className="font-semibold text-success">KSh {payoutKsh.toLocaleString("en-KE")}</span>
        {profitKsh > 0 && (
          <>
            {" "}
            <span className="text-success">
              (+KSh {Math.round(profitKsh).toLocaleString("en-KE")})
            </span>
          </>
        )}
        <span className="text-muted-foreground/70"> · incl. fee</span>
      </p>

      <Button
        type="button"
        onClick={buy}
        className="mt-2.5 min-h-[48px] w-full bg-success text-base font-bold text-success-foreground hover:bg-success/90"
      >
        Buy {side === "yes" ? "Yes" : "No"} — {formatKES(totalCents)}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        No account needed to draft. You sign in only when you buy.
      </p>

      <AuthGateModal
        open={gateOpen}
        onOpenChange={setGateOpen}
        question={market.question}
        side={side}
        shares={cleanShares}
        costLabel={formatKES(totalCents)}
      />
    </div>
  );
}

function AuthGateModal({
  open,
  onOpenChange,
  question,
  side,
  shares,
  costLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  question: string;
  side: DraftSide;
  shares: number;
  costLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Your prediction is ready</DialogTitle>
          <DialogDescription>
            Create a free account or log in to place it. Your draft stays saved on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{question}</p>
          <div className="num mt-2.5 flex items-center gap-2 text-sm">
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                side === "yes"
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive",
              )}
            >
              {side}
            </span>
            <span className="text-muted-foreground">
              {shares} {shares === 1 ? "share" : "shares"}
            </span>
            <span className="ml-auto font-bold text-foreground">{costLabel}</span>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
