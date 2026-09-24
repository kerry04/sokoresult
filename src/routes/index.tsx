import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/nav/PublicHeader";
import { MobileBottomNav } from "@/components/nav/MobileBottomNav";
import { FeaturedMarketCarousel } from "@/components/markets/FeaturedMarketCarousel";
import {
  CategoryRail,
  railKeyToDbCategory,
  RAIL_CATEGORIES,
} from "@/components/markets/CategoryRail";
import { ProductMarketCard } from "@/components/markets/ProductMarketCard";
import { NewsTicker } from "@/components/markets/NewsTicker";
import { EmptyMarketState } from "@/components/markets/EmptyMarketState";
import { PaymentBadges } from "@/components/marketing/PaymentBadges";
import {
  sortMarkets,
  type MarketSort,
  type PricePoint,
  type ProductMarket,
} from "@/components/markets/product-market";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SokoResult — Africa's Prediction Market" },
      {
        name: "description",
        content:
          "Browse live prediction markets on Kenyan politics, football, business, and culture. Draft your prediction free — sign in only when you buy.",
      },
      { property: "og:title", content: "SokoResult — Africa's Prediction Market" },
      {
        property: "og:description",
        content: "Browse live markets, draft your prediction, and trade probabilities in KES.",
      },
    ],
  }),
  component: LandingPage,
});

interface MarketRow {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
  closes_at: string | null;
  created_at: string;
}

function useOpenMarkets() {
  const [markets, setMarkets] = useState<ProductMarket[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: m, count: c } = await supabase
        .from("markets")
        .select(
          "id, slug, question, category, yes_price, no_price, volume_cents, trader_count, closes_at, created_at",
          { count: "exact" },
        )
        .eq("status", "open")
        .order("volume_cents", { ascending: false })
        .limit(12);
      if (cancelled) return;
      const rows = (m ?? []) as MarketRow[];
      setCount(c ?? rows.length);

      const histories: Record<string, PricePoint[]> = {};
      if (rows.length > 0) {
        const { data: ph } = await supabase
          .from("price_history")
          .select("market_id, yes_price, recorded_at")
          .in(
            "market_id",
            rows.map((r) => r.id),
          )
          .order("recorded_at", { ascending: true });
        (ph ?? ([] as { market_id: string; yes_price: number; recorded_at: string }[])).forEach(
          (row) => {
            const k = row.market_id;
            if (!histories[k]) histories[k] = [];
            histories[k].push({ yes_price: Number(row.yes_price), recorded_at: row.recorded_at });
          },
        );
      }
      if (!cancelled) {
        setMarkets(
          rows.map((r) => ({
            ...r,
            yes_price: Number(r.yes_price),
            no_price: Number(r.no_price),
            volume_cents: Number(r.volume_cents),
            trader_count: Number(r.trader_count ?? 0),
            history: histories[r.id] ?? [],
          })),
        );
        setLoading(false);
      }
    };
    load();
    // Keep the board live: refresh prices every 30s while the tab is visible,
    // so odds glide in without a page reload once markets are open.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { markets, count, loading };
}

function LandingPage() {
  const { markets, count, loading } = useOpenMarkets();

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[84px] md:pb-0">
      <PublicHeader />
      <NewsTicker />
      <main>
        {/* Markets first — no marketing hero. */}
        <section
          aria-labelledby="markets-heading"
          className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1
                id="markets-heading"
                className="text-2xl font-extrabold tracking-tight sm:text-3xl"
              >
                Markets
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Pick a side, set your stake, and draft your prediction — you sign in only when you
                buy.
              </p>
            </div>
            {!loading && count !== null && count > 0 && (
              <p className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                <span className="num font-semibold text-foreground">{count}</span> open
              </p>
            )}
          </div>

          <div className="mt-5">
            {loading ? (
              <div
                aria-hidden
                className="h-72 rounded-xl border border-border bg-card/50 animate-pulse"
              />
            ) : (
              <FeaturedMarketCarousel markets={markets} />
            )}
          </div>
        </section>

        <MarketsSection markets={markets} loading={loading} />
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}

/* ───────────────────────────  MARKET GRID  ─────────────────────────── */

const SORTS: { key: MarketSort; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "ending", label: "Ending soon" },
  { key: "volume", label: "Highest volume" },
];

function MarketsSection({ markets, loading }: { markets: ProductMarket[]; loading: boolean }) {
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<MarketSort>("trending");

  const visible = useMemo(() => {
    const db = railKeyToDbCategory(cat);
    const filtered = db ? markets.filter((m) => m.category === db) : markets;
    return sortMarkets(filtered, sort);
  }, [markets, cat, sort]);

  const catLabel = RAIL_CATEGORIES.find((c) => c.key === cat)?.label;

  return (
    <section aria-label="All markets" className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">All markets</h2>

      <div className="mt-4">
        <CategoryRail active={cat} onChange={setCat} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Sort markets">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            aria-pressed={sort === s.key}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
              sort === s.key
                ? "border-success/50 bg-success/10 text-success"
                : "border-border text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-64 rounded-xl border border-border bg-card/50 animate-pulse"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyMarketState topic={cat === "all" ? undefined : catLabel} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((m) => (
              <ProductMarketCard key={m.id} market={m} />
            ))}
          </div>
        )}
      </div>

      {!loading && visible.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" asChild>
            <Link to="/markets">
              Explore all markets <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────────  FOOTER  ─────────────────────────────── */

function SiteFooter() {
  const cols = [
    {
      title: "Trade",
      links: [
        { l: "All Markets", to: "/markets" },
        { l: "About SokoResult", to: "/learn/about" },
        { l: "How It Works", to: "/learn/how-to-trade" },
      ],
    },
    {
      title: "Company",
      links: [
        { l: "Contact", to: "/contact" },
        { l: "Learn", to: "/learn" },
      ],
    },
    {
      title: "Legal",
      links: [
        { l: "Terms", to: "/terms" },
        { l: "Responsible Trading", to: "/learn/risk" },
        { l: "Disclaimer", to: "/learn/disclaimer" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60 mt-auto bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="grid gap-10 md:gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo size="md" />
            <p className="mt-4 text-sm text-muted-foreground max-w-xs leading-relaxed">
              Africa&apos;s prediction market. Trade outcomes on the events shaping the continent —
              with information, not luck.
            </p>
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2.5">
                Pay with
              </div>
              <PaymentBadges />
            </div>
          </div>
          <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {cols.map((c) => (
              <FooterCol key={c.title} title={c.title} links={c.links} />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} SokoResult. Trade responsibly. 18+.</span>
          <span className="font-mono">Made in Nairobi</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { l: string; to: string }[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
        {title}
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.l}>
            <a
              href={link.to}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
