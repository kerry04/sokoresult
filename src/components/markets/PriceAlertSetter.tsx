import { useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAlert, isNotReady } from "@/lib/notifications-client";
import { cn } from "@/lib/utils";

/**
 * Compact price-alert setter for a binary market. Creates one alert via the
 * API — the alert only fires once /api/alerts/check is scheduled (the API
 * says so honestly when the table isn't live yet).
 */
export function PriceAlertSetter({
  marketId,
  currentYesPrice,
}: {
  marketId: string;
  currentYesPrice: number;
}) {
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const threshold = Number(pct);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 100) {
      setError("Enter a level between 1 and 99.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAlert({ market_id: marketId, direction, threshold_pct: threshold });
      setDone(true);
    } catch (e) {
      setError(
        isNotReady(e)
          ? "Price alerts aren't live yet — check back soon."
          : e instanceof Error
            ? e.message
            : "Couldn't create the alert.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-xs text-success">
        <Check className="h-4 w-4" />
        Alert set — we&apos;ll notify you when YES {direction === "above"
          ? "reaches"
          : "drops to"}{" "}
        {pct}%.
      </div>
    );
  }

  const current = Math.round(currentYesPrice * 100);

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium">
        <BellRing className="h-3.5 w-3.5 text-primary" />
        Notify me when YES
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-[11px] font-semibold">
          {(["above", "below"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              aria-pressed={direction === d}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                direction === d
                  ? "bg-primary/25 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d === "above" ? "rises to" : "falls to"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Input
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            placeholder={String(current)}
            inputMode="numeric"
            aria-label="Alert level in percent"
            className="h-9 w-16 text-center tabular-nums"
            style={{ fontFamily: "var(--font-nums)" }}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <Button size="sm" onClick={submit} disabled={busy} className="h-9">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set alert"}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
      <p className="mt-1.5 text-[10px] text-muted-foreground/70">
        One notification when it hits — never spam. Currently {current}%.
      </p>
    </div>
  );
}
