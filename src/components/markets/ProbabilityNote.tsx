import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Teaches the probability concept inline, where the price is shown.
 * "KSh 64 ≈ 64% — the market's implied probability that this happens."
 */
export function ProbabilityNote({ price, className }: { price: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(price * 100);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label="What does this price mean?"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-1/2 top-7 z-20 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-card"
        >
          <span className="num font-bold text-success">KSh {pct}</span> ≈ {pct}% — the market's
          implied probability that this happens. Prices move as traders buy and sell.
        </span>
      )}
    </span>
  );
}
