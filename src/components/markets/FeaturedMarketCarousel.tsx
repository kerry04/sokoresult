import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { MarketChart, useReducedMotion } from "./MarketChart";
import { ProbabilityBar } from "./ProbabilityBar";
import { MarketStats, type StatItem } from "./MarketStats";
import { TradingTicket } from "./TradingTicket";
import { DEMO_MARKETS, type CarouselMarket } from "./demo-markets";
import { CATEGORY_LABEL, formatKESCompact, formatTimeRemaining } from "@/lib/format";
import { priceChangePts, type ProductMarket } from "./product-market";
import { cn } from "@/lib/utils";

const ROTATE_MS = 7000;
const RESUME_MS = 5000;

function toCarouselMarket(m: ProductMarket): CarouselMarket {
  const change = priceChangePts(m.history);
  const stats: StatItem[] = [
    { label: "Volume", value: formatKESCompact(m.volume_cents), tone: "flat" },
    ...(change === null
      ? []
      : [
          {
            label: "24h",
            value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
            tone: (change > 0 ? "up" : change < 0 ? "down" : "flat") as StatItem["tone"],
          },
        ]),
    { label: "Traders", value: String(m.trader_count), tone: "flat" },
  ];
  return {
    id: m.id,
    slug: m.slug,
    question: m.question,
    category: CATEGORY_LABEL[m.category] ?? m.category,
    yes_price: m.yes_price,
    no_price: m.no_price,
    stats,
    closesLabel: formatTimeRemaining(m.closes_at),
    seed: m.id,
  };
}

/** Animated integer that tweens between values instead of snapping. */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const from = displayRef.current;
    if (from === value) return;
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * eased);
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return <span className={cn("num tabular-nums", className)}>{display}%</span>;
}

/**
 * The live market hero: a carousel of featured markets that auto-rotates,
 * with an animated price chart, gliding probability bar, compact live stats,
 * and the trading ticket beside it. Real open markets drive it; when the
 * database has none, clearly-tagged preview markets stand in so the
 * prototype can be evaluated.
 */
export function FeaturedMarketCarousel({ markets }: { markets: ProductMarket[] }) {
  const items = useMemo<CarouselMarket[]>(
    () => (markets.length > 0 ? markets.slice(0, 6).map(toCarouselMarket) : DEMO_MARKETS),
    [markets],
  );
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [cooling, setCooling] = useState(false);
  const coolingTimer = useRef<number | null>(null);
  const reduced = useReducedMotion();

  const safeIndex = Math.min(index, items.length - 1);
  const active = items[safeIndex];

  const poke = useCallback(
    (next: number) => {
      setIndex(((next % items.length) + items.length) % items.length);
      setCooling(true);
      if (coolingTimer.current) window.clearTimeout(coolingTimer.current);
      coolingTimer.current = window.setTimeout(() => setCooling(false), RESUME_MS);
    },
    [items.length],
  );

  useEffect(
    () => () => {
      if (coolingTimer.current) window.clearTimeout(coolingTimer.current);
    },
    [],
  );

  const paused = hovering || cooling || reduced;

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setIndex((i) => (i + 1) % items.length);
      }
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, items.length]);

  return (
    <article
      aria-roledescription="carousel"
      aria-label="Featured markets"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
    >
      <div className="relative">
        {items.map((m, i) => (
          <div
            key={m.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            aria-hidden={i !== safeIndex}
            className={cn(
              "carousel-slide",
              i === safeIndex ? "carousel-slide-visible" : "carousel-slide-hidden",
            )}
          >
            <Slide market={m} active={i === safeIndex} />
          </div>
        ))}
      </div>

      {/* Carousel chrome: indicators + prev/next */}
      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured markets">
          {items.map((m, i) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Show market ${i + 1}: ${m.question.slice(0, 60)}`}
              onClick={() => poke(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                i === safeIndex
                  ? "w-6 bg-success"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="num mr-2 text-xs tabular-nums text-muted-foreground" aria-hidden>
            {safeIndex + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={() => poke(safeIndex - 1)}
            aria-label="Previous market"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => poke(safeIndex + 1)}
            aria-label="Next market"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

function Slide({ market, active }: { market: CarouselMarket; active: boolean }) {
  const yesPct = Math.round(market.yes_price * 100);

  return (
    <div className="grid lg:grid-cols-[1.55fr_1fr]">
      {/* Left: the market */}
      <div className="flex flex-col p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
            Live
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {market.category}
          </span>
          {market.demo && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Preview
            </span>
          )}
        </div>

        <h2 className="mt-3 min-h-[3.6rem] max-w-2xl text-2xl font-extrabold leading-[1.15] tracking-tight sm:min-h-[4.4rem] sm:text-[2rem]">
          {market.question}
        </h2>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <AnimatedNumber
              value={yesPct}
              className="text-5xl font-extrabold tracking-tight text-success sm:text-6xl"
            />
            <span className="pb-1.5 text-sm text-muted-foreground">
              chance of <span className="font-semibold text-success">Yes</span>
            </span>
          </div>
          <span className="hidden pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 sm:block">
            Live market
          </span>
        </div>

        <div className="mt-2">
          <MarketChart
            key={market.seed}
            seed={market.seed}
            probability={market.yes_price}
            height={118}
            className="opacity-90"
          />
        </div>

        <div className="mt-3">
          <ProbabilityBar yesPct={yesPct} />
        </div>

        <div className="mt-4">
          <MarketStats items={market.stats} />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Closes {market.closesLabel}
          {!market.demo && (
            <Link
              to="/markets/$slug"
              params={{ slug: market.slug }}
              tabIndex={active ? 0 : -1}
              className="ml-3 inline-flex items-center gap-1 font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Market details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </p>
      </div>

      {/* Right: the trading ticket */}
      <div className="border-t border-border/60 bg-background/40 p-4 sm:p-5 lg:border-l lg:border-t-0">
        <TradingTicket
          key={market.id}
          market={{
            id: market.id,
            slug: market.slug,
            question: market.question,
            yes_price: market.yes_price,
            no_price: market.no_price,
          }}
          variant="wide"
          demo={market.demo}
        />
      </div>
    </div>
  );
}
