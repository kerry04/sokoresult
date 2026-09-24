import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { MarketChart, useReducedMotion } from "./MarketChart";
import { ProbabilityBar } from "./ProbabilityBar";
import { MarketStats, type StatItem } from "./MarketStats";
import { TradingTicket } from "./TradingTicket";
import { DEMO_MARKETS, type CarouselMarket } from "./demo-markets";
import {
  CATEGORY_LABEL,
  formatKESCompact,
  formatOneDecimal,
  formatTimeRemaining,
} from "@/lib/format";
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
            value: `${change > 0 ? "+" : ""}${formatOneDecimal(change)}%`,
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

/** Minimal matchMedia hook — no extra dependency for one responsive value. */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * The live market hero, ordered as: market identity → probability →
 * movement → trade. The question slides horizontally between markets while
 * the probability readout tweens, the bar glides, and stats flash — nothing
 * abruptly swaps. Real open markets drive it; clearly-tagged preview
 * markets stand in only when the database has none.
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
  const yesPct = Math.round(active.yes_price * 100);
  // The hero is a skyscraper on phones: shrink the chart so identity +
  // probability + trade fit comfortably above the fold.
  const smUp = useMediaQuery("(min-width: 640px)");

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

  // Swipe to navigate on touch devices. Vertical scrolling is untouched —
  // we only read the horizontal delta on touchend, never preventDefault.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) poke(safeIndex + (dx < 0 ? 1 : -1));
  };

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
      className="overflow-hidden rounded-xl border border-border bg-card shadow-card touch-pan-y"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="grid lg:grid-cols-[1.55fr_1fr]">
        {/* Left: identity → probability → movement */}
        <div className="flex flex-col p-4 sm:p-7">
          {/* Identity chrome */}
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
              Live
            </span>
            <div className="flex items-center gap-1">
              <span
                className="num mr-1.5 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
                aria-label={`Market ${safeIndex + 1} of ${items.length}`}
              >
                <span className="h-1 w-1 rounded-full bg-success/70" aria-hidden />
                {String(safeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => poke(safeIndex - 1)}
                aria-label="Previous market"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60 sm:h-7 sm:w-7"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => poke(safeIndex + 1)}
                aria-label="Next market"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60 sm:h-7 sm:w-7"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Sliding identity track: category + question */}
          <div className="mt-3 overflow-hidden">
            <div
              className="carousel-track"
              style={{ transform: `translateX(-${safeIndex * 100}%)` }}
            >
              {items.map((m, i) => (
                <div
                  key={m.id}
                  className="carousel-track-item"
                  aria-hidden={i !== safeIndex}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${items.length}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {m.category}
                    </span>
                    {m.demo && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Preview
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 min-h-[4.2rem] max-w-2xl text-xl font-bold leading-[1.25] tracking-tight sm:min-h-[4.6rem] sm:text-2xl">
                    {m.question}
                  </h2>
                </div>
              ))}
            </div>
          </div>

          {/* Probability — the visual anchor */}
          <div className="mt-1 flex items-end gap-3">
            <AnimatedNumber
              value={yesPct}
              className="text-6xl font-extrabold tracking-tight text-success sm:text-7xl"
            />
            <div className="pb-2">
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-success">Yes</div>
              <div className="mt-0.5 text-xs text-muted-foreground">chance</div>
            </div>
          </div>

          {/* Movement — deliberately quiet */}
          <div key={active.seed} className="animate-chart-in mt-1">
            <MarketChart
              seed={active.seed}
              probability={active.yes_price}
              height={smUp ? 84 : 60}
              className="opacity-80"
            />
          </div>

          <div className="mt-2">
            <ProbabilityBar yesPct={yesPct} />
          </div>

          <div className="mt-3 sm:mt-4">
            <MarketStats items={active.stats} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Closes {active.closesLabel}
            {!active.demo && (
              <Link
                to="/markets/$slug"
                params={{ slug: active.slug }}
                className="ml-3 inline-flex items-center gap-1 font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Market details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </p>
        </div>

        {/* Right: the trade */}
        <div className="border-t border-border/60 bg-background/40 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div key={active.id} className="animate-fade-in">
            <TradingTicket
              market={{
                id: active.id,
                slug: active.slug,
                question: active.question,
                yes_price: active.yes_price,
                no_price: active.no_price,
              }}
              variant="wide"
              demo={active.demo}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
