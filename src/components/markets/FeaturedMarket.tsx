import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketPriceChart } from "./MarketPriceChart";
import { ProbabilityNote } from "./ProbabilityNote";
import { DraftTradeTicket } from "./DraftTradeTicket";
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
 * The hero IS the featured market — an asymmetric live-trading panel, not a
 * marketing banner. Highest-volume open market drives it; the question is the
 * headline, the only accents are yes-green and no-red on dark.
 */
export function FeaturedMarket({ market }: { market: ProductMarket | null }) {
  if (!market) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-10">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
          Markets opening soon
        </div>
        <h2 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Be first to trade emerging Kenyan markets.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          We&apos;re preparing the first set of markets on Kenyan politics, football, and the
          economy. Create a free account and you&apos;ll be ready the moment trading opens.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {UPCOMING_TOPICS.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {t}{" "}
              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                soon
              </span>
            </span>
          ))}
        </div>
        <div className="mt-7">
          <Button asChild variant="outline" className="font-semibold">
            <Link to="/signup">
              Get notified <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const yesPct = Math.round(market.yes_price * 100);
  const noPct = Math.round(market.no_price * 100);
  // Real recorded observations only — never synthesize timestamps.
  const points = market.history;

  return (
    <article
      aria-labelledby="featured-market-question"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid lg:grid-cols-[1.55fr_1fr]">
        {/* Left: the market, treated as the headline story */}
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

          {/* The question IS the headline — extra-bold, dominant. */}
          <h2
            id="featured-market-question"
            className="mt-4 max-w-2xl text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl"
          >
            {market.question}
          </h2>

          {/* The one live number + the two-accent probability bar. */}
          <div className="mt-6 flex items-end gap-2">
            <span className="num text-5xl font-extrabold tracking-tight text-success sm:text-6xl">
              {yesPct}%
            </span>
            <span className="pb-2 text-sm text-muted-foreground">chance of Yes</span>
            <ProbabilityNote price={market.yes_price} className="pb-1.5" />
          </div>
          <div
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted/30"
            role="img"
            aria-label={`Yes ${yesPct} percent, No ${noPct} percent`}
          >
            <div className="bg-success transition-all" style={{ width: `${yesPct}%` }} />
            <div className="bg-destructive transition-all" style={{ width: `${noPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-success">Yes</span>
            <span className="font-semibold uppercase tracking-wider text-destructive">No</span>
          </div>

          {/* Restrained stats row — mono numbers, quiet labels. */}
          <dl className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Yes price
              </dt>
              <dd className="num mt-1 text-lg font-bold text-success">
                {formatPrice(market.yes_price)}
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                No price
              </dt>
              <dd className="num mt-1 text-lg font-bold text-destructive">
                {formatPrice(market.no_price)}
              </dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume</dt>
              <dd className="num mt-1 text-lg font-bold">
                {formatKESCompact(market.volume_cents)}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-muted-foreground">
            Ends {formatTimeRemaining(market.closes_at)}
            {market.trader_count > 0 && (
              <>
                {" "}
                · <span className="num">{market.trader_count}</span> traders
              </>
            )}
          </p>
        </div>

        {/* Right: the trading ticket — the action side of the split. */}
        <div className="border-t border-border/60 bg-background/30 p-4 sm:p-6 lg:border-l lg:border-t-0">
          <DraftTradeTicket market={market} variant="wide" />
          <Link
            to="/markets/$slug"
            params={{ slug: market.slug }}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Market details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Bottom: live price action — the trading-terminal signal. */}
      <div className="border-t border-border/60 px-6 py-4 sm:px-8">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Yes price
        </div>
        {points.length >= 2 ? (
          <MarketPriceChart points={points} height={180} />
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Price history will appear here after the first trades.
          </p>
        )}
      </div>
    </article>
  );
}
