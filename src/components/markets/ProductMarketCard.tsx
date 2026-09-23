import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CATEGORY_LABEL, formatKESCompact, formatPrice, formatTimeRemaining } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { priceChangePts, type ProductMarket } from "./product-market";
import { cn } from "@/lib/utils";

/**
 * Product-first market card. Information hierarchy:
 * question → probability → price action → volume/close.
 * Restrained borders, no decoration. Whole card links to market detail.
 */
export function ProductMarketCard({ market }: { market: ProductMarket }) {
  const yesPct = Math.round(market.yes_price * 100);
  const change = priceChangePts(market.history);
  const up = change !== null && change >= 0;

  return (
    <Link
      to="/markets/$slug"
      params={{ slug: market.slug }}
      search={{}}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/90">
          {CATEGORY_LABEL[market.category] ?? market.category}
        </span>
        {change !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums",
              up ? "text-success" : "text-destructive",
            )}
            aria-label={`Price moved ${up ? "up" : "down"} ${Math.abs(change).toFixed(1)} points`}
          >
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {up ? "+" : "−"}
            {Math.abs(change).toFixed(1)} pts
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">New market</span>
        )}
      </div>

      <h3 className="mt-2.5 min-h-[2.75rem] text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-foreground">
        {market.question}
      </h3>

      {/* Probability bar */}
      <div className="mt-3" role="img" aria-label={`Yes probability ${yesPct} percent`}>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wider">Yes</span>
          <span className="num font-bold text-success">{yesPct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/70">
          <div className="h-full rounded-full bg-success" style={{ width: `${yesPct}%` }} />
        </div>
      </div>

      {market.history.length >= 2 && (
        <Sparkline points={market.history.map((p) => p.yes_price)} height={56} className="mt-3" />
      )}

      {/* Yes / No prices */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-success/25 bg-success/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-success">Yes</div>
          <div className="num mt-0.5 text-sm font-bold text-success">
            {formatPrice(market.yes_price)}
          </div>
        </div>
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
            No
          </div>
          <div className="num mt-0.5 text-sm font-bold text-destructive">
            {formatPrice(market.no_price)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span className="num">Vol {formatKESCompact(market.volume_cents)}</span>
        <span>Ends {formatTimeRemaining(market.closes_at)}</span>
      </div>
    </Link>
  );
}
