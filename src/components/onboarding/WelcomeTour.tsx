import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  PieChart,
  TrendingUp,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_KEY = "soko:tutorial-done";

export function markTutorialDone() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

/* ---------- Step 3: practice ticket (pure local state, no real trade) ---------- */

function PracticeTicket() {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [shares, setShares] = useState(100);
  const price = side === "yes" ? 0.62 : 0.38;
  const stake = shares * price;
  const fee = stake * 0.03;
  const total = stake + fee;
  const payout = shares * 1;

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left">
      <p className="text-xs text-muted-foreground">Practice market</p>
      <p className="mt-1 text-sm font-semibold leading-snug">
        Will it rain in Nairobi this Saturday?
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            aria-pressed={side === s}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition",
              side === s
                ? s === "yes"
                  ? "border-success bg-success/15 text-success"
                  : "border-destructive bg-destructive/15 text-destructive"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "yes" ? "Yes 62%" : "No 38%"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Shares</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShares((v) => Math.max(10, v - 10))}
            className="h-8 w-8 rounded-lg border border-border text-lg leading-none"
            aria-label="Fewer shares"
          >
            −
          </button>
          <span className="w-12 text-center text-sm font-bold tabular-nums" style={{ fontFamily: "var(--font-nums)" }}>
            {shares}
          </span>
          <button
            type="button"
            onClick={() => setShares((v) => Math.min(1000, v + 10))}
            className="h-8 w-8 rounded-lg border border-border text-lg leading-none"
            aria-label="More shares"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stake</span>
          <span className="tabular-nums font-medium" style={{ fontFamily: "var(--font-nums)" }}>
            KSh {total.toFixed(0)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">If {side === "yes" ? "YES" : "NO"} wins</span>
          <span className="tabular-nums font-bold text-success" style={{ fontFamily: "var(--font-nums)" }}>
            KSh {payout.toFixed(0)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/70">
        Practice only — nothing here touches real money.
      </p>
    </div>
  );
}

/* ---------- Steps ---------- */

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
  render?: () => React.ReactNode;
  cta?: string;
}

const STEPS: Step[] = [
  {
    icon: <TrendingUp className="h-6 w-6 text-success" />,
    title: "The board is the app",
    body: "Every card is a real question — politics, sports, culture — with a live crowd probability. Scroll, tap a category, find something you have a take on.",
  },
  {
    icon: <PieChart className="h-6 w-6 text-primary" />,
    title: "Read it in one glance",
    body: "62% YES means the crowd thinks it's likely. Green is YES, red is NO. The thin line under each card shows how the price moved — and the Soko model row shows what our AI thinks versus the crowd.",
  },
  {
    icon: <Check className="h-6 w-6 text-success" />,
    title: "Try a practice trade",
    body: "Pick a side and set your shares. The ticket always shows your stake and what you win if you're right — before you commit. Go ahead, tap around:",
    render: () => <PracticeTicket />,
    cta: "Looks good",
  },
  {
    icon: <WalletIcon className="h-6 w-6 text-primary" />,
    title: "Your money, clearly",
    body: "You start with KSh 10,000 in demo money to learn the ropes. When you're ready, top up with M-Pesa from the Wallet tab. Withdrawals open once the payout rail is verified — we'll say so loudly.",
  },
  {
    icon: <Bell className="h-6 w-6 text-primary" />,
    title: "Stay in the loop",
    body: "The bell up top carries payouts, resolutions and price alerts. Set a price alert on any market and we'll ping you when it hits your level. That's the whole tour — put your money where your mouth is.",
    cta: "Start trading",
  },
];

/* ---------- Tour ---------- */

export function WelcomeTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    markTutorialDone();
    onDone();
  };

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex gap-1.5" role="tablist" aria-label="Tour progress">
          {STEPS.map((_, d) => (
            <span
              key={d}
              className={cn(
                "h-1.5 rounded-full transition-all",
                d === i ? "w-6 bg-success" : d < i ? "w-3 bg-success/50" : "w-3 bg-border",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={finish}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Skip tour
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
            {step.icon}
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          {step.render && <div className="mt-4">{step.render()}</div>}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => (last ? finish() : setI((v) => v + 1))}
          className="gap-1 bg-success font-semibold text-success-foreground hover:bg-success/90"
        >
          {step.cta ?? (last ? "Start trading" : "Next")}
          {!last && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
