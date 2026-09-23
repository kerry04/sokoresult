import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Percent, PlusCircle, Vote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/nav/PublicHeader";
import { MobileBottomNav } from "@/components/nav/MobileBottomNav";
import { FeaturedMarket } from "@/components/markets/FeaturedMarket";
import {
  CategoryRail,
  railKeyToDbCategory,
  RAIL_CATEGORIES,
} from "@/components/markets/CategoryRail";
import { ProductMarketCard } from "@/components/markets/ProductMarketCard";
import { EmptyMarketState } from "@/components/markets/EmptyMarketState";
import { TrendingMarkets } from "@/components/markets/TrendingMarkets";
import { HowItWorksStrip } from "@/components/marketing/HowItWorksStrip";
import { MoneyStrip } from "@/components/marketing/MoneyStrip";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { PaymentBadges } from "@/components/marketing/PaymentBadges";
import {
  sortMarkets,
  type MarketSort,
  type PricePoint,
  type ProductMarket,
} from "@/components/markets/product-market";
import okoCoin from "@/assets/oko-coin.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SokoResult — Africa's Prediction Market" },
      {
        name: "description",
        content:
          "Trade on what happens next. Prediction markets built for Kenya and Africa — trade probabilities and settle in KES.",
      },
      { property: "og:title", content: "SokoResult — Africa's Prediction Market" },
      {
        property: "og:description",
        content: "Trade on what happens next. Prediction markets for Kenya and Africa.",
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
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { markets, count, loading };
}

function LandingPage() {
  const { markets, count, loading } = useOpenMarkets();

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[84px] md:pb-0">
      <PublicHeader />
      <main>
        <Hero markets={markets} loading={loading} />
        <MarketsSection markets={markets} count={count} loading={loading} />
        <div id="trending" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6 sm:py-14">
          <TrendingMarkets markets={markets} />
        </div>
        <HowItWorksStrip />
        <MoneyStrip />
        <TrustStrip />
        <TokenTeaser />
        <BottomCTA />
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}

/* ───────────────────────────────  HERO  ─────────────────────────────── */

function Hero({ markets, loading }: { markets: ProductMarket[]; loading: boolean }) {
  const featured = markets[0] ?? null;

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-grid-dots opacity-30 pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
            Live markets
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Trade on what happens next.
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground sm:text-lg leading-relaxed">
            Prediction markets built for Kenya and Africa. Follow real-world events, trade
            probabilities, and settle in KES.
          </p>
        </div>
        <div className="mt-8">
          {loading ? (
            <div
              aria-hidden
              className="h-72 rounded-xl border border-border bg-card/50 animate-pulse"
            />
          ) : (
            <FeaturedMarket market={featured} />
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────  MARKETS SECTION  ─────────────────────────── */

const SORTS: { key: MarketSort; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "ending", label: "Ending soon" },
  { key: "volume", label: "Highest volume" },
];

function MarketsSection({
  markets,
  count,
  loading,
}: {
  markets: ProductMarket[];
  count: number | null;
  loading: boolean;
}) {
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<MarketSort>("trending");

  const visible = useMemo(() => {
    const db = railKeyToDbCategory(cat);
    const filtered = db ? markets.filter((m) => m.category === db) : markets;
    return sortMarkets(filtered, sort);
  }, [markets, cat, sort]);

  const catLabel = RAIL_CATEGORIES.find((c) => c.key === cat)?.label;

  return (
    <section
      aria-labelledby="markets-heading"
      className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Live markets
          </p>
          <h2 id="markets-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            What&apos;s trading now
          </h2>
        </div>
        {!loading && count !== null && count > 0 && (
          <p className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
            <span className="num font-semibold text-foreground">{count}</span> open
          </p>
        )}
      </div>

      <div className="mt-5">
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

/* ───────────────────────────────  TOKEN TEASER  ─────────────────────────────── */

function TokenTeaser() {
  const perks = [
    {
      icon: Percent,
      t: "Fee discounts",
      d: "Pay trading fees in $OKO and keep more of your profits.",
    },
    {
      icon: PlusCircle,
      t: "Create markets",
      d: "Stake $OKO to propose and launch your own prediction markets.",
    },
    {
      icon: Vote,
      t: "Governance",
      d: "Vote on categories, fees, and protocol upgrades.",
      planned: true,
    },
  ];
  return (
    <section aria-labelledby="token-heading" className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            $OKO Token
          </p>
          <h2 id="token-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Own a piece of the market
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            The $OKO utility token powers the SokoResult ecosystem. Token launch details will be
            announced — trading today works in KES.
          </p>
          <ul className="mt-6 space-y-4">
            {perks.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.t} className="flex gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-success">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 text-[15px] font-semibold">
                      {p.t}
                      {p.planned && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Planned
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex justify-center lg:justify-end">
          <img
            src={okoCoin}
            alt="$OKO token"
            className="w-52 sm:w-64"
            draggable={false}
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────  CTA + FOOTER  ─────────────────────────────── */

function BottomCTA() {
  return (
    <section className="px-4 sm:px-6 py-14 sm:py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card p-10 sm:p-16 text-center">
        <div
          aria-hidden
          className="absolute -top-32 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-primary/15 blur-[120px] pointer-events-none"
        />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
            Free demo account
          </p>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Try it before you trust it.
          </h2>
          <p className="mt-4 mx-auto max-w-md text-muted-foreground">
            Sign up free, practice with a demo account, and make your first trade in minutes. No
            card, no deposit, no risk.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="bg-success font-semibold text-success-foreground hover:bg-success/90 min-h-[48px]"
            >
              <Link to="/signup">
                Try the demo account <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="min-h-[48px]">
              <Link to="/markets">Browse markets</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const cols = [
    {
      title: "Trade",
      links: [
        { l: "All Markets", to: "/markets" },
        { l: "Politics", to: "/markets" },
        { l: "Sports", to: "/markets" },
        { l: "Entertainment", to: "/markets" },
      ],
    },
    {
      title: "Platform",
      links: [
        { l: "How It Works", to: "/learn/how-to-trade" },
        { l: "$OKO Token", to: "/#token" },
        { l: "Developers", to: "/learn" },
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
          <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
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
