import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketPriceChart } from "./MarketPriceChart";
import { ProbabilityNote } from "./ProbabilityNote";
import { CATEGORY_LABEL, formatKESCompact, formatPrice, formatTimeRemaining } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { ProductMarket } from "./product-market";

/** Clearly-labeled upcoming topics — NOT live markets. Never shows fake prices. */
const UPCOMING_TOPICS = [
  "2027 Kenyan presidential race",
  "Harambee Stars AFCON qualification",
  "Kenya inflation & interest rates",
  "EPL title race",
];

/**
 * Dominant featured-market panel. Uses the highest-volume real market;
 * falls back to an intentional "opening soon" state when the book is empty.
 */
export function FeaturedMarket({ market }: { market: ProductMarket | null }) {
  if (!market) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
          Markets opening soon
        </div>
        <h2 className="mt-3 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
          Be first to trade emerging Kenyan markets.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          We're preparing the first set of markets on Kenyan politics, football, and the economy.
          Create a free account and you'll be ready the moment trading opens.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {UPCOMING_TOPICS.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {t}{" "}
              <span className="ml-1 text-[10px] uppercase tracking-wider text-warning">soon</span>
            </span>
          ))}
        </div>
        <div className="mt-6">
          <Button
            asChild
            className="bg-success font-semibold text-success-foreground hover:bg-success/90"
          >
            <Link to="/signup">
              Get notified <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const yesPct = Math.round(market.yes_price * 100);
  // Real recorded observations only — never synthesize timestamps.
  const points = market.history;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        {/* Left: market info */}
        <div className="flex flex-col p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
              Live
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[market.category] ?? market.category}
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-[2rem]">
            {market.question}
          </h2>

          <div className="mt-5 flex items-end gap-2">
            <span className="num text-4xl font-bold text-success sm:text-5xl">{yesPct}%</span>
            <span className="pb-1.5 text-sm text-muted-foreground">chance Yes</span>
            <ProbabilityNote price={market.yes_price} className="pb-1" />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Yes price
              </div>
              <div className="num mt-0.5 font-bold text-success">
                {formatPrice(market.yes_price)}
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                No price
              </div>
              <div className="num mt-0.5 font-bold text-destructive">
                {formatPrice(market.no_price)}
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Volume
              </div>
              <div className="num mt-0.5 font-bold">{formatKESCompact(market.volume_cents)}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Ends {formatTimeRemaining(market.closes_at)}
            {market.trader_count > 0 && (
              <>
                {" "}
                · <span className="num">{market.trader_count}</span> traders
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              asChild
              size="lg"
              className="min-h-[44px] bg-success font-semibold text-success-foreground hover:bg-success/90"
            >
              <Link to="/markets/$slug" params={{ slug: market.slug }} search={{ side: "YES" }}>
                Buy Yes — {formatPrice(market.yes_price)}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-[44px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Link to="/markets/$slug" params={{ slug: market.slug }} search={{ side: "NO" }}>
                Buy No — {formatPrice(market.no_price)}
              </Link>
            </Button>
          </div>
        </div>

        {/* Right: real price chart */}
        <div className="border-t border-border/60 bg-background/40 p-4 sm:p-6 lg:border-l lg:border-t-0">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Yes price
          </div>
          {points.length >= 2 ? (
            <MarketPriceChart points={points} height={240} />
          ) : (
            <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border text-center">
              <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                Price history will appear here after the first trades.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
