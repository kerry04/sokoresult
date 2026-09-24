import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { MarketChart, useReducedMotion } from "./MarketChart";
import { ProbabilityBar } from "./ProbabilityBar";
import { MarketStats, type StatItem } from "./MarketStats";
import { TradingTicket } from "./TradingTicket";
import { DEMO_MARKETS, type CarouselMarket } from "./demo-markets";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  CATEGORY_LABEL,
  formatKESCompact,
  formatOneDecimal,
  formatPrice,
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

interface HeroProps {
  items: CarouselMarket[];
  safeIndex: number;
  active: CarouselMarket;
  yesPct: number;
  poke: (next: number) => void;
}

function ChromeRow({
  items,
  safeIndex,
  poke,
  compact = false,
}: Pick<HeroProps, "items" | "safeIndex" | "poke"> & { compact?: boolean }) {
  return (
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
          className={cn(
            "inline-flex items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
            compact ? "h-8 w-8" : "h-9 w-9 sm:h-7 sm:w-7",
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => poke(safeIndex + 1)}
          aria-label="Next market"
          className={cn(
            "inline-flex items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:-translate-y-px hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
            compact ? "h-8 w-8" : "h-9 w-9 sm:h-7 sm:w-7",
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Phone hero: one compact card — identity, probability, movement, then two
 * trade buttons. Tapping a side opens the full ticket as a bottom sheet so
 * the hero itself stays short enough to fit a phone screen comfortably.
 */
function MobileHero({ items, safeIndex, active, yesPct, poke }: HeroProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSide, setSheetSide] = useState<"yes" | "no">("yes");

  const openSheet = (side: "yes" | "no") => {
    setSheetSide(side);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="flex flex-col p-4">
        <ChromeRow items={items} safeIndex={safeIndex} poke={poke} compact />

        {/* Sliding identity track: category + question */}
        <div className="mt-2.5 overflow-hidden">
          <div className="carousel-track" style={{ transform: `translateX(-${safeIndex * 100}%)` }}>
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
                <h2 className="mt-1.5 text-[17px] font-bold leading-snug tracking-tight line-clamp-3">
                  {m.question}
                </h2>
              </div>
            ))}
          </div>
        </div>

        {/* Probability — sized for a phone, with closes/details alongside */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <AnimatedNumber
              value={yesPct}
              className="text-[3rem] font-extrabold leading-none tracking-tight text-success"
            />
            <div className="pb-1">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-success">Yes</div>
              <div className="text-[11px] text-muted-foreground">chance</div>
            </div>
          </div>
          <div className="pb-1 text-right text-[11px] leading-relaxed text-muted-foreground">
            <div>Closes {active.closesLabel}</div>
            {!active.demo && (
              <Link
                to="/markets/$slug"
                params={{ slug: active.slug }}
                className="mt-0.5 inline-flex items-center gap-1 font-semibold transition-colors hover:text-foreground"
              >
                Details <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-2.5">
          <ProbabilityBar yesPct={yesPct} />
        </div>

        {/* Movement — short strip, deliberately quiet */}
        <div key={active.seed} className="animate-chart-in mt-2.5">
          <MarketChart
            seed={active.seed}
            probability={active.yes_price}
            height={52}
            className="opacity-80"
          />
        </div>

        <div className="mt-2.5">
          <MarketStats items={active.stats} />
        </div>

        {/* Trade — two buttons, full ticket lives in the bottom sheet */}
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openSheet("yes")}
            aria-label={`Trade Yes at ${formatPrice(active.yes_price)}`}
            className="flex items-center justify-between rounded-lg border border-success/50 bg-success/[0.08] px-3.5 py-3 transition-all duration-150 hover:-translate-y-px active:translate-y-0"
          >
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-success">
              Yes
            </span>
            <span className="num text-[15px] font-bold tabular-nums text-success">
              {formatPrice(active.yes_price)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => openSheet("no")}
            aria-label={`Trade No at ${formatPrice(active.no_price)}`}
            className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/[0.08] px-3.5 py-3 transition-all duration-150 hover:-translate-y-px active:translate-y-0"
          >
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-destructive">
              No
            </span>
            <span className="num text-[15px] font-bold tabular-nums text-destructive">
              {formatPrice(active.no_price)}
            </span>
          </button>
        </div>

        {/* Position dots */}
        {items.length > 1 && (
          <div
            className="mt-3.5 flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label="Choose market"
          >
            {items.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Market ${i + 1}`}
                onClick={() => poke(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === safeIndex
                    ? "w-5 bg-foreground"
                    : "w-1.5 bg-border hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom-sheet trade ticket (phone only) */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            aria-label={`Trade: ${active.question}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 sm:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
          >
            <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-border" aria-hidden />
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
              defaultSide={sheetSide}
            />
            <DialogPrimitive.Close
              aria-label="Close trade ticket"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  );
}

/**
 * Laptop/desktop hero, ordered as: market identity → probability →
 * movement → trade. The question slides horizontally between markets while
 * the probability readout tweens, the bar glides, and stats flash — nothing
 * abruptly swaps. Real open markets drive it; clearly-tagged preview
 * markets stand in only when the database has none.
 */
function DesktopHero({
  items,
  safeIndex,
  active,
  yesPct,
  poke,
  smUp,
}: HeroProps & { smUp: boolean }) {
  return (
    <div className="grid lg:grid-cols-[1.55fr_1fr]">
      {/* Left: identity → probability → movement */}
      <div className="flex flex-col p-4 sm:p-6 lg:p-7">
        <ChromeRow items={items} safeIndex={safeIndex} poke={poke} />

        {/* Sliding identity track: category + question */}
        <div className="mt-3 overflow-hidden">
          <div className="carousel-track" style={{ transform: `translateX(-${safeIndex * 100}%)` }}>
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
                <h2 className="mt-2 min-h-[4.2rem] max-w-2xl text-[clamp(1.125rem,4.6vw,1.25rem)] font-bold leading-[1.25] tracking-tight sm:min-h-[4.6rem] sm:text-2xl">
                  {m.question}
                </h2>
              </div>
            ))}
          </div>
        </div>

        {/* Probability — the visual anchor. */}
        <div className="mt-1 flex items-end gap-3">
          <AnimatedNumber
            value={yesPct}
            className="text-7xl font-extrabold tracking-tight text-success"
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
  );
}

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

  const heroProps: HeroProps = { items, safeIndex, active, yesPct, poke };

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
      {/* Phone hero */}
      <div className="sm:hidden">
        <MobileHero {...heroProps} />
      </div>
      {/* Laptop/desktop hero */}
      <div className="hidden sm:block">
        <DesktopHero {...heroProps} smUp={smUp} />
      </div>
    </article>
  );
}
