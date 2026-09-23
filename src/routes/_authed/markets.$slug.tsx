import { createFileRoute, Link } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageSquare } from "lucide-react";
import { MarketPriceChart } from "@/components/markets/MarketPriceChart";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/common/BackButton";
import { CandidateList, type OutcomeRow } from "@/components/markets/CandidateList";
import { SellPanel } from "@/components/markets/SellPanel";

import { ProbabilityNote } from "@/components/markets/ProbabilityNote";
import {
  VerificationGateModal,
  FirstTradeWarning,
} from "@/components/markets/VerificationGateModal";
import { MarketActivityStrip } from "@/components/engagement/MarketActivityStrip";
import { LiveTradeStream } from "@/components/engagement/LiveTradeStream";
import { CountdownPill } from "@/components/engagement/CountdownPill";
import { fireConfettiAt } from "@/components/engagement/ConfettiBurst";
import { playChaChing } from "@/lib/sound";
import { recordTradeEngagement } from "@/lib/engagement";
import { useRef as useReactRef } from "react";
const MarketNewsStream = lazy(() =>
  import("@/components/markets/MarketNewsStream").then((m) => ({ default: m.MarketNewsStream })),
);
const FIRST_TRADE_KEY = "soko-first-trade-ack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  formatKES,
  formatKESCompact,
  formatNumberCompact,
  formatPercent,
  formatPrice,
  formatTimeRemaining,
} from "@/lib/format";

type MarketSearch = {
  side?: "YES" | "NO";
  amount?: number;
  shares?: number;
  tab?: "buy" | "sell";
  outcome?: string;
};

export const Route = createFileRoute("/_authed/markets/$slug")({
  head: () => ({ meta: [{ title: "Market — SokoResult" }] }),
  validateSearch: (search: Record<string, unknown>): MarketSearch => {
    const sideRaw = String(search.side ?? "").toUpperCase();
    const side = sideRaw === "YES" || sideRaw === "NO" ? (sideRaw as "YES" | "NO") : undefined;
    const amountNum = Number(search.amount);
    const amount =
      Number.isFinite(amountNum) && amountNum > 0 ? Math.min(amountNum, 1_000_000) : undefined;
    const sharesNum = Math.floor(Number(search.shares));
    const shares =
      Number.isFinite(sharesNum) && sharesNum > 0 ? Math.min(sharesNum, 1_000_000) : undefined;
    const tabRaw = String(search.tab ?? "").toLowerCase();
    const tab = tabRaw === "sell" || tabRaw === "buy" ? (tabRaw as "buy" | "sell") : undefined;
    const outcomeRaw = typeof search.outcome === "string" ? search.outcome : undefined;
    return { side, amount, shares, tab, outcome: outcomeRaw };
  },
  component: MarketDetailPage,
});

interface Market {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  category: string;
  market_type: "binary" | "multi";
  status: string;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
  closes_at: string | null;
  keywords: string[] | null;
  liquidity_b: number;
  image_url: string | null;
}

interface PricePoint {
  yes_price: number;
  recorded_at: string;
}

const RANGES = [
  { key: "1D", days: 1 },
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "ALL", days: 9999 },
] as const;

function MarketDetailPage() {
  const { slug } = Route.useParams();
  const { profile } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30D");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase
        .from("markets")
        .select(
          "id, slug, question, description, category, market_type, status, yes_price, no_price, volume_cents, trader_count, closes_at, keywords, liquidity_b, image_url",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (!m) {
        setLoading(false);
        return;
      }
      setMarket(m as Market);
      const { data: ph } = await supabase
        .from("price_history")
        .select("yes_price, recorded_at")
        .eq("market_id", m.id)
        .order("recorded_at", { ascending: true });
      if (cancelled) return;
      setHistory((ph ?? []) as PricePoint[]);
      if ((m as Market).market_type === "multi") {
        const { data: os } = await supabase
          .from("market_outcomes")
          .select("id, label, image_url, price, sort_order")
          .eq("market_id", m.id)
          .order("price", { ascending: false });
        if (!cancelled) setOutcomes((os ?? []) as OutcomeRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Realtime price + history updates — runs only once market.id is known so
  // we never call .on() after .subscribe() on a reused channel.
  useEffect(() => {
    if (!market?.id) return;
    const channel = supabase
      .channel(`market-live-${market.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "markets", filter: `id=eq.${market.id}` },
        (payload) => {
          const n = payload.new as Market;
          setMarket((prev) => (prev ? { ...prev, ...n } : prev));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "price_history",
          filter: `market_id=eq.${market.id}`,
        },
        (payload) => {
          const p = payload.new as PricePoint;
          setHistory((h) => [...h, p]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "market_outcomes",
          filter: `market_id=eq.${market.id}`,
        },
        (payload) => {
          const u = payload.new as OutcomeRow;
          setOutcomes((prev) => prev.map((o) => (o.id === u.id ? { ...o, ...u } : o)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [market?.id]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  if (!market) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Market not found</h2>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/markets">Back to markets</Link>
        </Button>
      </div>
    );
  }

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;
  const cutoff = Date.now() - days * 86_400_000;
  const filtered = history.filter((p) => new Date(p.recorded_at).getTime() >= cutoff);

  return (
    <div className="w-full px-2 sm:px-4 py-3 sm:py-5 max-w-7xl mx-auto pb-28 lg:pb-5 box-border overflow-x-hidden">
      <BackButton fallback="/markets" label="Back" className="mb-2 -ml-2" />

      <div className="grid lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-5">
        <div className="space-y-3 sm:space-y-4 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-border bg-card p-3 sm:p-4"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                {CATEGORY_LABEL[market.category] ?? market.category}
              </Badge>
              {market.closes_at && (
                <Badge variant="outline" className="text-[10px]">
                  Closes{" "}
                  {new Date(market.closes_at).toLocaleDateString("en-KE", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Badge>
              )}
              <CountdownPill closesAt={market.closes_at} />
            </div>
            <div className="mt-2 sm:mt-3 flex gap-3 items-start">
              {market.image_url && (
                <img
                  src={market.image_url}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl object-cover border border-border/60 shrink-0"
                />
              )}
              <h1 className="text-base sm:text-lg lg:text-xl font-bold tracking-tight leading-snug flex-1 min-w-0 break-words">
                {market.question}
              </h1>
            </div>

            {market.market_type === "multi" ? (
              <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Leading
                  </div>
                  <div className="num text-primary text-sm sm:text-base font-bold truncate">
                    {outcomes[0]?.label ?? "—"}{" "}
                    <span className="text-xs">
                      {outcomes[0] ? `KSh ${(Number(outcomes[0].price) * 100).toFixed(0)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Volume
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatKESCompact(market.volume_cents)}
                  </div>
                </div>
                <div className="hidden sm:block min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Traders
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatNumberCompact(market.trader_count)}
                  </div>
                </div>
                <div
                  className="hidden sm:block min-w-0"
                  title="Initial liquidity provided by the market maker. Larger = more stable price."
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Depth
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatKESCompact(Number(market.liquidity_b) * 1000)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    YES <ProbabilityNote price={Number(market.yes_price)} />
                  </div>
                  <div className="num text-success text-lg sm:text-xl font-bold truncate">
                    {formatPercent(Number(market.yes_price))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    NO
                  </div>
                  <div className="num text-destructive text-lg sm:text-xl font-bold truncate">
                    {formatPercent(Number(market.no_price))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Volume
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatKESCompact(market.volume_cents)}
                  </div>
                </div>
                <div className="hidden sm:block min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Traders
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatNumberCompact(market.trader_count)}
                  </div>
                </div>
                <div
                  className="hidden sm:block min-w-0"
                  title="Initial liquidity provided by the market maker. Larger = more stable price."
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Depth
                  </div>
                  <div className="num text-base sm:text-lg font-bold truncate">
                    {formatKESCompact(Number(market.liquidity_b) * 1000)}
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Live activity strip */}
          <MarketActivityStrip marketId={market.id} />

          {/* Chart — only for binary markets in v1 */}
          {market.market_type === "binary" && (
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">YES probability</h3>
                <div className="flex gap-1 rounded-md border border-border p-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={cn(
                        "px-2 py-1 text-[11px] font-mono rounded min-h-[28px]",
                        range === r.key
                          ? "bg-primary/30 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r.key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:hidden">
                <MarketPriceChart points={filtered} height={180} />
              </div>
              <div className="hidden sm:block">
                <MarketPriceChart points={filtered} height={220} />
              </div>
            </div>
          )}

          {/* Description */}
          {market.description && (
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <h3 className="font-semibold mb-1.5 text-sm">About this market</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{market.description}</p>
            </div>
          )}

          {/* Cinematic live news stream — lazy on mobile */}
          <Suspense
            fallback={
              <div className="h-32 rounded-2xl border border-border bg-card animate-pulse" />
            }
          >
            <MarketNewsStream marketId={market.id} keywords={market.keywords ?? []} />
          </Suspense>

          {/* Comments */}
          <CommentsSection marketId={market.id} userId={profile?.id ?? null} />
        </div>

        {/* Trade panel — desktop sticky */}
        <div className="hidden lg:block lg:sticky lg:top-20 lg:self-start space-y-4">
          <TradeTabs market={market} balance={profile?.kes_balance ?? 0} outcomes={outcomes} />
          <LiveTradeStream marketId={market.id} />
        </div>
      </div>

      {/* Mobile sticky trade bar — binary only; multi shows the candidate list inline above */}
      {market.market_type === "binary" ? (
        <MobileTradeBar market={market} balance={profile?.kes_balance ?? 0} outcomes={outcomes} />
      ) : (
        <div className="lg:hidden mt-6">
          <TradeTabs market={market} balance={profile?.kes_balance ?? 0} outcomes={outcomes} />
        </div>
      )}
    </div>
  );
}

function TradeTabs({
  market,
  balance,
  outcomes,
}: {
  market: Market;
  balance: number;
  outcomes: OutcomeRow[];
}) {
  const search = Route.useSearch();
  const [tab, setTab] = useState<"buy" | "sell">(search.tab ?? "buy");
  const isClosed = market.status !== "open";
  const labelMap: Record<string, string> = {};
  outcomes.forEach((o) => {
    labelMap[o.id] = o.label;
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
        <button
          onClick={() => setTab("buy")}
          className={cn(
            "flex-1 h-11 rounded-lg text-sm font-bold uppercase tracking-wider transition",
            tab === "buy"
              ? "bg-success text-success-foreground shadow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setTab("sell")}
          className={cn(
            "flex-1 h-11 rounded-lg text-sm font-bold uppercase tracking-wider transition",
            tab === "sell"
              ? "bg-destructive text-destructive-foreground shadow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sell
        </button>
      </div>

      {tab === "buy" ? (
        market.market_type === "multi" ? (
          <CandidateList
            marketId={market.id}
            outcomes={outcomes}
            balance={balance}
            status={market.status}
          />
        ) : (
          <TradePanel market={market} balance={balance} />
        )
      ) : (
        <SellPanel
          marketId={market.id}
          marketType={market.market_type}
          outcomeLabels={labelMap}
          initialOutcome={search.side ?? null}
          initialOutcomeId={search.outcome ?? null}
          isClosed={isClosed}
        />
      )}
    </div>
  );
}

function MobileTradeBar({
  market,
  balance,
  outcomes,
}: {
  market: Market;
  balance: number;
  outcomes: OutcomeRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="lg:hidden fixed inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-xl"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex gap-3 num text-sm">
            <span className="text-success font-bold">
              YES {formatPrice(Number(market.yes_price))}
            </span>
            <span className="text-destructive font-bold">
              NO {formatPrice(Number(market.no_price))}
            </span>
          </div>
          <Button
            size="sm"
            className="bg-success text-success-foreground hover:bg-success/90 font-semibold min-h-[44px] px-5"
            onClick={() => setOpen(true)}
          >
            Trade
          </Button>
        </div>
      </div>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute bottom-0 inset-x-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-border bg-background p-4"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
            <TradeTabs market={market} balance={balance} outcomes={outcomes} />
          </div>
        </div>
      )}
    </>
  );
}

const PRESET_SHARES = [1, 5, 10, 25, 50, 100];

function TradePanel({ market, balance }: { market: Market; balance: number }) {
  const { user, profile, refreshProfile, enqueueAchievements } = useAuth();
  const search = Route.useSearch();
  const [outcome, setOutcome] = useState<"yes" | "no">(search.side === "NO" ? "no" : "yes");
  // Draft handoff from the public trade ticket (side + shares pre-filled).
  const [shares, setShares] = useState<number>(search.shares ?? 10);
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [firstTradeOpen, setFirstTradeOpen] = useState(false);
  const buttonRef = useReactRef<HTMLButtonElement>(null);
  const mountedAtRef = useReactRef<number>(Date.now());

  const price = outcome === "yes" ? Number(market.yes_price) : Number(market.no_price);
  const priceKsh = price * 100;
  const grossCents = Math.round(price * 10000 * shares);
  const feeCents = Math.round((grossCents * 300) / 10000);
  const totalCents = grossCents + feeCents;
  const totalKsh = Math.round(totalCents / 100);
  const payoutKsh = shares * 100;
  const profitKsh = Math.max(0, payoutKsh - totalKsh);

  useEffect(() => {
    refreshProfile();
    mountedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeTrade = async () => {
    setSubmitting(true);
    try {
      const { error } = await (supabase.rpc as any)("execute_lmsr_trade_binary", {
        _market_id: market.id,
        _outcome: outcome.toUpperCase(),
        _side: "BUY",
        _quantity: shares,
      });
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      await refreshProfile();
      toast.success(`Bought ${shares} ${outcome.toUpperCase()} shares`, {
        description: "Trade executed. Balance updated.",
      });
      playChaChing();
      fireConfettiAt(buttonRef.current);
      const secs = Math.floor((Date.now() - mountedAtRef.current) / 1000);
      const eng = await recordTradeEngagement(market.id, market.category, secs);
      if (eng?.newAchievements?.length) {
        await enqueueAchievements(eng.newAchievements);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!user) {
      toast.error("Sign in to trade");
      return;
    }
    if (market.status !== "open") {
      toast.error("This market is closed");
      return;
    }
    if (shares < 1) {
      toast.error("Pick at least 1 share");
      return;
    }
    if (totalCents > balance) {
      toast.error("Not enough balance");
      return;
    }
    if ((profile?.kyc_tier ?? 0) < 1) {
      setGateOpen(true);
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(FIRST_TRADE_KEY) !== "1") {
      setFirstTradeOpen(true);
      return;
    }
    await executeTrade();
  };

  const yesPct = Number(market.yes_price) * 100;
  const noPct = Number(market.no_price) * 100;
  const isClosed = market.status !== "open";
  const notEnough = totalCents > balance;
  const MIN_PRICE = 1 / 10;
  const yesLongshot = Number(market.yes_price) > 0 && Number(market.yes_price) < MIN_PRICE;
  const noLongshot = Number(market.no_price) > 0 && Number(market.no_price) < MIN_PRICE;
  const currentLongshot = outcome === "yes" ? yesLongshot : noLongshot;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Outcome picker */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => !yesLongshot && setOutcome("yes")}
          disabled={yesLongshot}
          className={cn(
            "rounded-xl border-2 px-2 py-2.5 sm:py-3 text-center transition min-w-0",
            yesLongshot
              ? "border-border bg-background/20 opacity-50 cursor-not-allowed"
              : outcome === "yes"
                ? "border-success bg-success/10 ring-2 ring-success/30"
                : "border-border bg-background/40 hover:border-success/50",
          )}
        >
          <div className="text-lg sm:text-xl">👍</div>
          <div className="text-[10px] uppercase tracking-wider text-success/80 mt-0.5">YES</div>
          <div className="font-mono text-success text-base sm:text-lg font-bold truncate">
            KSh {yesPct.toFixed(0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {yesLongshot ? "Too unlikely" : `${yesPct.toFixed(0)}% chance`}
          </div>
        </button>
        <button
          onClick={() => !noLongshot && setOutcome("no")}
          disabled={noLongshot}
          className={cn(
            "rounded-xl border-2 px-2 py-2.5 sm:py-3 text-center transition min-w-0",
            noLongshot
              ? "border-border bg-background/20 opacity-50 cursor-not-allowed"
              : outcome === "no"
                ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                : "border-border bg-background/40 hover:border-destructive/50",
          )}
        >
          <div className="text-lg sm:text-xl">👎</div>
          <div className="text-[10px] uppercase tracking-wider text-destructive/80 mt-0.5">NO</div>
          <div className="font-mono text-destructive text-base sm:text-lg font-bold truncate">
            KSh {noPct.toFixed(0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {noLongshot ? "Too unlikely" : `${noPct.toFixed(0)}% chance`}
          </div>
        </button>
      </div>

      {/* Shares picker */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">How many shares?</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_SHARES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setCustomMode(false);
                setShares(n);
              }}
              className={cn(
                "py-2.5 rounded-lg border-2 font-mono text-sm font-semibold transition",
                !customMode && shares === n
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {n} {n === 1 ? "share" : "shares"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={cn(
              "py-2.5 rounded-lg border-2 font-mono text-sm font-semibold transition col-span-3",
              customMode
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            Custom number of shares…
          </button>
        </div>
        {customMode && (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={shares}
            onChange={(e) => setShares(Math.max(1, parseInt(e.target.value || "1", 10)))}
            placeholder="Enter number of shares"
            className="h-11 font-mono text-lg"
            autoFocus
          />
        )}
        <div className="text-xs text-muted-foreground pt-1 flex justify-between gap-2">
          <span className="truncate">
            Price/share:{" "}
            <span className="font-mono font-semibold text-foreground">
              KSh {priceKsh.toFixed(0)}
            </span>
          </span>
          <span className="truncate">
            Balance:{" "}
            <span className="font-mono font-semibold text-foreground">{formatKES(balance)}</span>
          </span>
        </div>
      </div>

      {/* Win summary */}
      <div className="rounded-xl border border-border bg-background/40 p-3 space-y-1.5">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          💰 If <span className="uppercase">{outcome}</span> wins
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground truncate">Shares:</span>
            <span className="font-mono font-semibold">{shares.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground truncate">Total cost:</span>
            <span className="font-mono font-semibold">KSh {totalKsh.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground truncate">If correct:</span>
            <span className="font-mono font-semibold">KSh {payoutKsh.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-border/60 gap-2">
            <span className="text-muted-foreground truncate">Profit:</span>
            <span className="font-mono font-bold text-success">
              +KSh {profitKsh.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 flex items-center justify-between gap-2 flex-wrap">
          <span>Incl. 3% fee · KSh 100/share if correct</span>
          <span className="text-right">Closes {formatTimeRemaining(market.closes_at)}</span>
        </div>
      </div>

      {/* CTA */}
      <Button
        ref={buttonRef}
        onClick={submit}
        disabled={submitting || isClosed || shares < 1 || notEnough || currentLongshot}
        className={cn(
          "w-full h-12 text-sm font-bold shadow-lg ring-2 ring-offset-2 ring-offset-background transition uppercase tracking-wide",
          outcome === "yes"
            ? "bg-success text-success-foreground hover:bg-success/90 ring-success/30"
            : "bg-destructive text-destructive-foreground hover:bg-destructive/90 ring-destructive/30",
        )}
      >
        {submitting
          ? "Processing…"
          : isClosed
            ? "Market closed"
            : currentLongshot
              ? "Too unlikely to trade"
              : notEnough
                ? `Need KSh ${Math.ceil((totalCents - balance) / 100).toLocaleString()} more`
                : `Buy ${shares} ${outcome.toUpperCase()} for KSh ${totalKsh.toLocaleString()}`}
      </Button>
      <p className="text-[11px] text-center text-muted-foreground">
        By trading, you agree to the{" "}
        <Link to="/learn/disclaimer" className="underline hover:text-foreground">
          rules
        </Link>
        .
      </p>

      <VerificationGateModal open={gateOpen} onOpenChange={setGateOpen} />
      <FirstTradeWarning
        open={firstTradeOpen}
        onCancel={() => setFirstTradeOpen(false)}
        onConfirm={() => {
          if (typeof window !== "undefined") localStorage.setItem(FIRST_TRADE_KEY, "1");
          setFirstTradeOpen(false);
          executeTrade();
        }}
      />
    </div>
  );
}

interface CommentRow {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  display_name?: string | null;
  likes?: number;
}

function CommentsSection({ marketId, userId }: { marketId: string; userId: string | null }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("comments")
      .select("id, body, user_id, created_at")
      .eq("market_id", marketId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as Array<{
      id: string;
      body: string;
      user_id: string;
      created_at: string;
    }>;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const nameMap: Record<string, string | null> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles_public")
        .select("id, display_name")
        .in("id", userIds);
      (profs ?? []).forEach((p) => {
        nameMap[(p as { id: string }).id] = (p as { display_name: string | null }).display_name;
      });
    }
    setComments(
      rows.map((c) => ({
        id: c.id,
        body: c.body,
        user_id: c.user_id,
        created_at: c.created_at,
        display_name: nameMap[c.user_id] ?? null,
        likes: 0,
      })),
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  const submit = async () => {
    if (!userId) {
      toast.error("Sign in to comment");
      return;
    }
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) return;
    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({
      market_id: marketId,
      user_id: userId,
      body: text,
    });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setBody("");
    load();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <h3 className="font-semibold flex items-center gap-2 mb-1">
        <MessageSquare className="h-4 w-4" /> Discussion on this market
        <span className="text-xs text-muted-foreground font-normal">({comments.length})</span>
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Comments below are specific to this market only.
      </p>

      <div className="space-y-2 mb-5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={userId ? "Share your take on this market…" : "Sign in to comment"}
          maxLength={2000}
          rows={3}
          disabled={!userId}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!userId || submitting || body.trim().length === 0}
            onClick={submit}
          >
            Post comment
          </Button>
        </div>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet on this market. Be the first.
          </p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-border/60 bg-background/40 p-3 sm:p-4 flex gap-3"
          >
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/20 ring-1 ring-primary/40 flex items-center justify-center font-mono text-xs">
              {(c.display_name ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{c.display_name ?? "trader"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("en-KE", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {c.body}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <button className="flex items-center gap-1 hover:text-destructive transition">
                  <Heart className="h-3 w-3" /> Like
                </button>
                <button className="hover:text-foreground transition">Reply</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
