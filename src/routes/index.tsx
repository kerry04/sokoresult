import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Newspaper,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Zap,
  Layers,
  Command,
  Globe2,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABEL, formatKESCompact, formatPercent } from "@/lib/format";
import okoCoin from "@/assets/oko-coin.png";
import { LiveChart } from "@/components/markets/LiveChart";
import { CountUp } from "@/components/marketing/CountUp";
import { PaymentBadges } from "@/components/marketing/PaymentBadges";
import { AnimatedSparkline, deriveChangePct } from "@/components/markets/AnimatedSparkline";
import { Radio, Twitter, MessageCircle, Database, BarChart3, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SokoResult — Africa's Prediction Market" },
      {
        name: "description",
        content:
          "Buy and sell shares on real-world outcomes across Africa. Politics, sports, entertainment, economics. Profit when you're right.",
      },
      { property: "og:title", content: "SokoResult — Africa's Prediction Market" },
      {
        property: "og:description",
        content: "Put your money where your mouth is. Africa's prediction market.",
      },
    ],
  }),
  component: LandingPage,
});

interface PreviewMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  volume_cents: number;
}

function LandingPage() {
  const [markets, setMarkets] = useState<PreviewMarket[]>([]);

  useEffect(() => {
    supabase
      .from("markets")
      .select("id, slug, question, category, yes_price, volume_cents")
      .eq("status", "open")
      .order("volume_cents", { ascending: false })
      .limit(6)
      .then(({ data }) => setMarkets((data ?? []) as PreviewMarket[]));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <Hero />
      <StatsTicker />
      <WorkedExample />
      <LiveMarkets markets={markets} />
      <NewsEcosystem />
      <InformationSection />
      <TokenSection />
      <Ownership />
      <BottomCTA />
      <SiteFooter />
    </div>
  );
}

/* ───────────────────────────────  HEADER  ─────────────────────────────── */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center">
          <Logo size="md" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <Link to="/markets" className="hover:text-foreground transition">Markets</Link>
          <a href="#how" className="hover:text-foreground transition">How It Works</a>
          <a href="#token" className="hover:text-foreground transition">Token</a>
          <a href="#build" className="hover:text-foreground transition">Developers</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild className="bg-success text-success-foreground hover:bg-success/90 font-semibold">
            <Link to="/signup">Start Trading</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────────────  HERO  ─────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* dotted grid */}
      <div className="absolute inset-0 bg-grid-dots opacity-[0.45] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      {/* purple glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-primary/25 blur-[120px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          {/* LEFT: copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/15 text-primary-foreground/95 px-3 py-1 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-success mr-2 animate-pulse" />
                Now Live — Nairobi, Kenya
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mt-6 text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-7xl font-extrabold tracking-tight"
            >
              Africa's<br />
              <span className="text-success">Prediction</span><br />
              Market<span className="text-success">.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-6 max-w-md text-base sm:text-lg text-muted-foreground leading-relaxed"
            >
              Buy and sell shares in real-world outcomes. Politics. Sports.
              Entertainment. Fashion. Profit when you're right — or sell early
              when the price moves.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" asChild className="bg-success text-success-foreground hover:bg-success/90 font-semibold h-12 px-6 rounded-xl">
                <Link to="/signup">
                  Start Trading <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-6 rounded-xl border-border bg-card/40 hover:bg-card">
                <a href="#build">Read Whitepaper</a>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-10"
            >
              <PaymentBadges showLabel />
            </motion.div>
          </div>

          {/* RIGHT: featured live market card */}
          <FeaturedMarketCard />
        </div>
      </div>
    </section>
  );
}

function FeaturedMarketCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl border border-border bg-card/70 backdrop-blur p-5 sm:p-6 shadow-card overflow-hidden"
    >
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-success/15 blur-3xl pointer-events-none" />
      <LiveChart height={210} />
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs relative">
        <StatBox label="YES" tone="success">
          <CountUp to={74} prefix="KSh " />
        </StatBox>
        <StatBox label="NO" tone="destructive">
          <CountUp to={26} prefix="KSh " />
        </StatBox>
        <StatBox label="Vol">
          <CountUp to={4.8} decimals={1} prefix="KSh " suffix="M" />
        </StatBox>
      </div>
    </motion.div>
  );
}

function StatBox({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "success" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={
          "font-mono font-bold mt-0.5 tabular-nums " +
          (tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground")
        }
      >
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────────────  STATS TICKER  ─────────────────────────────── */

function StatsTicker() {
  const items = [
    { label: "Markets", to: 247, decimals: 0 },
    { label: "Volume", to: 48.6, decimals: 1, prefix: "KES ", suffix: "M" },
    { label: "Traders", to: 12.8, decimals: 1, suffix: "K" },
    { label: "$OKO", to: 2.45, decimals: 2, prefix: "KES ", change: "+4.2%" },
  ];
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</span>
            <span className="mt-1 font-mono text-2xl font-bold text-foreground tabular-nums">
              <CountUp to={s.to} decimals={s.decimals} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} />{" "}
              {s.change && <span className="text-success text-sm">{s.change}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────────  WORKED EXAMPLE  ─────────────────────────────── */

function WorkedExample() {
  const rows = [
    { icon: Calendar, t: "Amina buys", d: "100 YES shares @ KES 50 each", v: "−KES 5,000", tone: "muted" },
    { icon: Newspaper, t: "News breaks", d: "Opposition candidate withdraws from race", v: "+17pts", tone: "pink" },
    { icon: TrendingUp, t: "Price jumps", d: "Market reprices YES to KES 75", v: "KES 75", tone: "muted" },
    { icon: DollarSign, t: "Amina sells", d: "100 shares @ KES 75 each", v: "+KES 7,500", tone: "success" },
  ];
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 sm:px-6 py-20 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-10 sm:mb-14 text-center"
      >
        <Badge variant="outline" className="rounded-full border-success/40 bg-success/10 text-success text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
          How it works
        </Badge>
        <h2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          How does <span className="text-success">SokoResult</span> work<span className="text-accent-pink">?</span>
        </h2>
        <p className="mt-4 mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg leading-relaxed">
          A short story is worth a thousand explainers. Meet Amina — and follow her trade
          from a hunch to a 50% return in three days.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-border bg-card/60 p-6 sm:p-10"
      >
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8 lg:gap-12">
          <div>
            <div className="inline-flex items-center gap-2 text-success text-xs font-semibold uppercase tracking-[0.2em]">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Worked Example
            </div>
            <h3 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">The Amina Trade</h3>
            <p className="mt-4 text-muted-foreground max-w-md text-sm sm:text-base leading-relaxed">
              Amina follows Kenyan politics closely. She sees the
              <span className="text-foreground font-semibold"> 2027 presidential market</span> trading
              YES at <span className="font-mono text-foreground">KSh 50</span> — meaning the crowd thinks
              there's a 50% chance. But she's been watching the opposition's polling collapse and
              believes it's closer to <span className="text-foreground font-semibold">75%</span>.
            </p>
            <p className="mt-3 text-muted-foreground max-w-md text-sm sm:text-base leading-relaxed">
              She buys <span className="text-foreground font-semibold">100 YES shares for KSh 5,000</span>.
              Three days later news confirms her thesis. Price snaps to{" "}
              <span className="text-foreground font-semibold">KSh 75</span>. She sells.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <ProfitStat label="Cost">
                <CountUp to={5000} prefix="KES " />
              </ProfitStat>
              <ProfitStat label="Sold for">
                <CountUp to={7500} prefix="KES " />
              </ProfitStat>
              <ProfitStat label="Profit" tone="success">
                +<CountUp to={2500} prefix="KES " />
              </ProfitStat>
            </div>

            <div className="mt-5 inline-flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-3">
              <span className="font-mono text-2xl font-bold text-success">+50%</span>
              <span className="text-xs text-success/85 max-w-[200px] leading-snug">
                Return on capital — in 3 days, on a single trade.
              </span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground max-w-md leading-relaxed">
              That's the model. Information becomes price. Price becomes profit.
              No leverage. No options. No middleman. Your conviction, your capital.
            </p>
          </div>

          <motion.div
            className="relative space-y-1"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ show: { transition: { staggerChildren: 0.18, delayChildren: 0.1 } } }}
          >
            {/* Animated vertical connector that draws down through the steps */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-[27px] top-4 bottom-4 w-px origin-top bg-gradient-to-b from-primary/0 via-primary/60 to-success/70"
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.2, ease: "easeInOut", delay: 0.2 }}
            />
            {rows.map((r) => {
              const Icon = r.icon;
              const tone =
                r.tone === "success" ? "text-success" : r.tone === "pink" ? "text-accent-pink" : "text-foreground";
              return (
                <motion.div
                  key={r.t}
                  variants={{
                    hidden: { opacity: 0, x: -16 },
                    show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: "easeOut" } },
                  }}
                  className="relative flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-background/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <motion.span
                      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-foreground/90 ring-1 ring-primary/30 shrink-0"
                      whileHover={{ scale: 1.08 }}
                    >
                      <Icon className="h-4 w-4" />
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-lg ring-2 ring-primary/50"
                        initial={{ opacity: 0, scale: 1 }}
                        whileInView={{ opacity: [0, 0.7, 0], scale: [1, 1.6, 1.8] }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 1.1, ease: "easeOut" }}
                      />
                    </motion.span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{r.t}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.d}</div>
                    </div>
                  </div>
                  <motion.div
                    className={"font-mono text-sm font-bold whitespace-nowrap " + tone}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                  >
                    {r.v}
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function ProfitStat({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "success";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={
          "font-mono font-bold mt-1 text-sm tabular-nums " +
          (tone === "success" ? "text-success" : "text-foreground")
        }
      >
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────  NEWS ECOSYSTEM / SENTIMENT  ─────────────────────── */

function NewsEcosystem() {
  const sources = [
    { icon: Radio, label: "Public news domains", count: "120+", desc: "Citizen Digital, Standard, Daily Nation, Pulse, Premium Times" },
    { icon: Twitter, label: "X / Twitter firehose", count: "Real-time", desc: "Tracked handles, hashtags, geo-tagged posts across East & West Africa" },
    { icon: MessageCircle, label: "TikTok & Telegram", count: "8k channels", desc: "Public Telegram channels and trending TikTok audio across Africa" },
    { icon: Database, label: "Government feeds", count: "Open data", desc: "IEBC, KNBS, parliamentary Hansard, gazette notices" },
  ];

  const sentiments = [
    { topic: "Finance Bill 2026", bull: 18, bear: 82, vol: "47k posts" },
    { topic: "SHA rollout", bull: 31, bear: 69, vol: "22k posts" },
    { topic: "Ruto re-election", bull: 44, bear: 56, vol: "61k posts" },
    { topic: "Gachagua comeback", bull: 38, bear: 62, vol: "29k posts" },
  ];

  return (
    <section id="ecosystem" className="relative overflow-hidden border-y border-border/60 bg-card/20">
      <div className="absolute -left-40 top-1/3 h-[400px] w-[400px] rounded-full bg-accent-pink/10 blur-[140px] pointer-events-none" />
      <div className="absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[140px] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <Badge variant="outline" className="rounded-full border-accent-pink/40 bg-accent-pink/10 text-accent-pink text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
            More than a market
          </Badge>
          <h2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            A live archive of what
            <br />
            <span className="text-success">citizens actually think</span>
            <span className="text-accent-pink">.</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            SokoResult ingests news from <span className="text-foreground font-semibold">public domains</span>{" "}
            and <span className="text-foreground font-semibold">social media</span> across Africa, and
            cross-references it with how thousands of Kenyans are actually trading on the outcome.
            The result is a real-time sentiment map of how the public feels about its government —
            something polls take weeks to capture and often get wrong.
          </p>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            Every trade is a vote. Every market is a question. Every spike on the chart is a piece
            of civic evidence — timestamped, anonymous, and on-chain.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-2 gap-6">
          {/* Sources */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Where the signal comes from
            </div>
            <div className="mt-5 space-y-3">
              {sources.map((s) => {
                const I = s.icon;
                return (
                  <div key={s.label} className="flex items-start gap-4 rounded-xl border border-border/60 bg-background/40 p-4 hover:border-primary/40 transition">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30 text-primary-foreground/90">
                      <I className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{s.label}</div>
                        <span className="font-mono text-xs text-success shrink-0">{s.count}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sentiment dashboard */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5" /> Citizen sentiment — last 24h
              </span>
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> live
              </span>
            </div>
            <div className="mt-5 space-y-4">
              {sentiments.map((s, i) => (
                <motion.div
                  key={s.topic}
                  initial={{ opacity: 0, x: 12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{s.topic}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{s.vol}</span>
                  </div>
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-border/60">
                    <motion.div
                      className="bg-success h-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${s.bull}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: "easeOut" }}
                    />
                    <motion.div
                      className="bg-destructive h-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${s.bear}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: "easeOut" }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] font-mono">
                    <span className="text-success">{s.bull}% supportive</span>
                    <span className="text-destructive">{s.bear}% critical</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <MiniMetric icon={Users} label="Citizens tracked">
                <CountUp to={148} suffix="k" />
              </MiniMetric>
              <MiniMetric icon={Newspaper} label="Stories / day">
                <CountUp to={3200} />
              </MiniMetric>
              <MiniMetric icon={ShieldCheck} label="Sources verified">
                <CountUp to={92} suffix="%" />
              </MiniMetric>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground max-w-2xl mx-auto">
          We're building the public record of what Kenyans believed, when they believed it,
          and what it cost them to be right. Use the data freely via our open APIs.
        </p>
      </div>
    </section>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Users;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-mono font-bold mt-1 text-sm tabular-nums">{children}</div>
    </div>
  );
}

/* ───────────────────────────────  LIVE MARKETS  ─────────────────────────────── */

function LiveMarkets({ markets }: { markets: PreviewMarket[] }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? markets : markets.filter((m) => m.category === filter);

  return (
    <section id="markets" className="mx-auto max-w-7xl px-4 sm:px-6 pb-20 sm:pb-28">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/15 text-primary-foreground/95 text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
            Live Markets
          </Badge>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">What's Trading Now</h2>
        </div>
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> {markets.length} markets open
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["all", "politics", "sports", "entertainment", "economics"].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition border " +
              (filter === c
                ? "bg-primary text-primary-foreground border-primary shadow-glow"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/40")
            }
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c] ?? c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m, i) => (
          <MarketTile key={m.id} m={m} delay={i * 0.05} />
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <Button variant="outline" asChild className="rounded-full border-border bg-card/40 hover:bg-card">
          <Link to="/markets">Explore All Markets <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>
    </section>
  );
}

function MarketTile({ m, delay }: { m: PreviewMarket; delay: number }) {
  // Deterministic seed from market id → identical SSR + CSR (no hydration mismatch)
  const seed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) & 0xfffffff;
    return (h % 1000) / 1000;
  }, [m.id]);
  const trend: "up" | "down" = seed > 0.42 ? "up" : "down";
  const changePct = deriveChangePct(seed, trend);
  const up = changePct >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay }}
    >
      <Link
        to="/markets/$slug"
        params={{ slug: m.slug }} search={{}}
        className="block rounded-2xl border border-border bg-card/60 p-5 hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-glow transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/15 text-primary-foreground/90 border border-primary/30 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
            {CATEGORY_LABEL[m.category] ?? m.category}
          </span>
          <span
            className={
              "ml-auto inline-flex items-center gap-1 text-xs font-mono font-bold tabular-nums " +
              (up ? "text-success" : "text-destructive")
            }
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            <CountUp to={Math.abs(changePct)} decimals={1} suffix="%" duration={1100} />
          </span>
        </div>
        <h3 className="mt-3 text-[15px] font-semibold leading-snug min-h-[2.6rem] line-clamp-2">{m.question}</h3>
        <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">YES probability</div>
        <ProbabilityBar value={Number(m.yes_price)} />
        <AnimatedSparkline seed={seed} trend={trend} className="mt-3" height={64} />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">Vol {formatKESCompact(m.volume_cents)}</span>
          <span className="font-mono text-success text-base font-bold tabular-nums">
            <CountUp to={Math.round(Number(m.yes_price) * 100)} prefix="KSh " duration={1200} />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function ProbabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="mt-1 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${pct}%`, boxShadow: "0 0 12px color-mix(in oklab, var(--success) 60%, transparent)" }}
        />
      </div>
      <span className="font-mono text-success text-sm font-bold">KSh {pct}</span>
    </div>
  );
}

/* ───────────────────────  INFORMATION MOVES MONEY  ─────────────────────── */

function InformationSection() {
  const bullets = [
    { i: ShieldCheck, t: "Verified by our correspondents", d: "Every story goes through our editorial process before it's tagged as verified." },
    { i: Zap, t: "Average 4 minute news lag", d: "Faster than traditional media. Our network is on the ground." },
    { i: Globe2, t: "Coverage across 14 African countries", d: "Kenya, Nigeria, Ghana, South Africa, Ethiopia, Uganda, and more." },
  ];
  const news = [
    { src: "Citizen Digital", verified: true, time: "8 min ago", body: "Opposition candidate officially withdraws from 2027 presidential race citing health concerns", market: "Will William Ruto win 2027?", pts: "+17pts" },
    { src: "The Standard", verified: true, time: "18 min ago", body: "FIFA shortlists Kenya as potential host for U-20 World Cup 2027 alongside South Africa", market: "Will Kenya host FIFA U-20 WC?", pts: "+8pts" },
    { src: "Pulse Nigeria", verified: false, time: "42 min ago", body: "Nollywood director announces film entered in next year's Oscar consideration campaign", market: "Nollywood Oscar by 2028?", pts: "+9pts" },
    { src: "Nairobi News", verified: true, time: "1 hr ago", body: "Harambee Stars secure crucial AFCON qualifier win in Addis Ababa — 2-1 final", market: "Harambee Stars AFCON 2027?", pts: "+11pts" },
  ];
  return (
    <section className="border-y border-border/60 bg-card/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-[0.85fr_1.15fr] gap-12">
        <div>
          <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/15 text-primary-foreground/95 text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
            Verified Intel
          </Badge>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">
            Information<br />
            <span className="text-accent-pink">Moves</span> Money<span className="text-success">.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
            Our network of <span className="text-foreground font-semibold">50+ verified correspondents</span> across Africa delivers
            breaking news before anyone else. Every story is verified. Every story moves markets.
          </p>
          <div className="mt-8 space-y-5">
            {bullets.map((b) => {
              const I = b.i;
              return (
                <div key={b.t} className="flex gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30 text-primary-foreground/90">
                    <I className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-semibold">{b.t}</div>
                    <div className="text-sm text-muted-foreground">{b.d}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            See the news. <span className="text-foreground">Know the odds.</span> <span className="text-accent-pink">Make the trade.</span>
          </p>
        </div>

        <div className="space-y-3">
          {news.map((n, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="rounded-xl border border-border bg-background/60 p-4 hover:border-primary/40 transition"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{n.src}</span>
                  {n.verified ? (
                    <span className="inline-flex items-center rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[10px] font-semibold">✓ Verified</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 text-[10px] font-semibold">⏳ Pending</span>
                  )}
                </div>
                <span className="text-muted-foreground">{n.time}</span>
              </div>
              <p className="mt-2 text-sm leading-snug">{n.body}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">↳ {n.market}</span>
                <span className="font-mono text-success font-bold">{n.pts}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────  TOKEN  ─────────────────────────────── */

function TokenSection() {
  const cards = [
    { i: DollarSign, t: "30% Fee Discount", d: "Pay all trading fees in $OKO and keep more of your profits." },
    { i: Command, t: "Create Markets", d: "Stake $OKO to propose and launch your own prediction markets." },
    { i: Layers, t: "Earn via Airdrops", d: "Get $OKO for signing up, referring traders, and maintaining winning streaks." },
    { i: Command, t: "Governance Voting", d: "Vote on new market categories, fee structures, and protocol upgrades.", soon: true },
  ];
  return (
    <section id="token" className="relative overflow-hidden py-20 sm:py-28">
      <div className="absolute left-1/4 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-pink/15 blur-[120px] pointer-events-none" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
        <Badge variant="outline" className="rounded-full border-success/40 bg-success/10 text-success text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
          $OKO Token
        </Badge>
        <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Own a Piece of the Market</h2>
        <p className="mt-4 mx-auto max-w-2xl text-muted-foreground">
          $OKO is the utility token that powers the entire SokoResult ecosystem. Trade. Stake. Govern. Earn.
        </p>
      </div>

      <div className="relative mx-auto mt-12 max-w-7xl px-4 sm:px-6 grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
        <div className="relative flex justify-center">
          {/* Halo */}
          <motion.div
            className="absolute inset-0 m-auto h-72 w-72 sm:h-96 sm:w-96 rounded-full bg-accent-pink/35 blur-[100px]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Sparkles */}
          {[
            { top: "10%", left: "8%", d: 0 },
            { top: "20%", right: "10%", d: 0.6 },
            { bottom: "12%", left: "14%", d: 1.2 },
            { bottom: "22%", right: "6%", d: 1.8 },
          ].map((p, i) => (
            <motion.span
              key={i}
              className="absolute h-1.5 w-1.5 rotate-45 bg-accent-pink rounded-[1px]"
              style={p as any}
              animate={{ opacity: [0, 1, 0], scale: [0.6, 1.4, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: p.d, ease: "easeInOut" }}
            />
          ))}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, rotate: -12 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <motion.img
              src={okoCoin}
              alt="$OKO token coin"
              animate={{ y: [0, -14, 0], rotate: [-2, 2, -2] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-64 sm:w-80 drop-shadow-[0_30px_50px_color-mix(in_oklab,var(--accent-pink)_55%,transparent)]"
            />
          </motion.div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map((c) => {
            const I = c.i;
            return (
              <div key={c.t} className="relative rounded-xl border border-border bg-card/60 p-5 hover:border-primary/40 transition">
                {c.soon && (
                  <span className="absolute top-3 right-3 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">Soon</span>
                )}
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-success/15 ring-1 ring-success/30 text-success">
                  <I className="h-4 w-4" />
                </span>
                <h3 className="mt-4 font-semibold">{c.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.d}</p>
              </div>
            );
          })}
          <div className="sm:col-span-2 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-background/40 px-5 py-4 mt-2">
            <Spec label="Total Supply" value="1,000,000,000 $OKO" />
            <Spec label="Initial Circulation" value="150,000,000 $OKO" />
            <Spec label="Network" value="Polygon" sub="Under development" />
            <Spec label="Launch Price" value="KES 2.45" />
          </div>
          <div className="sm:col-span-2 flex justify-center">
            <Button asChild className="rounded-xl bg-gradient-primary shadow-glow h-11 px-6">
              <Link to="/signup">Get $OKO <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Spec({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-bold mt-0.5 text-sm">{value}</div>
      {sub && (
        <div className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-warning font-semibold uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
          {sub}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────  OWNERSHIP  ─────────────────────────────── */

function Ownership() {
  return (
    <section id="build" className="mx-auto max-w-7xl px-4 sm:px-6 pb-10">
      <div className="grid lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border bg-card/60 p-8"
        >
          <h3 className="text-2xl sm:text-3xl font-bold">Build on SokoResult</h3>
          <p className="mt-2 text-muted-foreground text-sm max-w-md">
            Open APIs, on-chain data, and a Telegram graph API. We chose data to be the graph for Africa's prediction infrastructure.
          </p>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 text-xs">
            {["Market API", "OCDB API", "Telegram Graph API"].map((t) => (
              <div key={t} className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
                <div className="font-semibold">{t}</div>
                <div className="text-muted-foreground mt-0.5">Real-time market data, books, and trades.</div>
              </div>
            ))}
          </div>
          <pre className="mt-5 rounded-lg border border-border bg-background/60 p-4 text-[11px] font-mono overflow-x-auto">
{`{ "market": "ruto-2027",
  "yes": 0.54, "no": 0.46,
  "vol_kes": 4_822_318,
  "ts": "2026-04-21T08:00:00Z" }`}
          </pre>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 p-8 flex flex-col justify-between"
        >
          <div>
            <Badge variant="outline" className="rounded-full border-success/40 bg-success/10 text-success text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
              For Builders
            </Badge>
            <h3 className="mt-3 text-2xl sm:text-3xl font-bold">Pay Your Way</h3>
            <p className="mt-2 text-muted-foreground text-sm max-w-md">
              M-Pesa, card, or $OKO — deposit and withdraw in seconds. Settlements are instant; payouts on-chain.
            </p>
          </div>
          <div className="mt-6">
            <PaymentBadges />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ───────────────────────────────  CTA + FOOTER  ─────────────────────────────── */

function BottomCTA() {
  const phrases = [
    "Sign up — it's free.",
    "Get KES 10,000 demo cash.",
    "Make your first trade in 30 seconds.",
    "No card. No risk. Just practice.",
  ];
  return (
    <section className="px-4 sm:px-6 py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card/60 p-10 sm:p-16 text-center">
        {/* Subtle ambient glow — no flat purple slab */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 bg-grid-dots opacity-[0.18] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative">
          <Badge variant="outline" className="rounded-full border-success/40 bg-success/10 text-success text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success mr-2 animate-pulse" />
            Free demo account
          </Badge>

          <h2 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            Try it before you trust it<span className="text-success">.</span>
          </h2>

          {/* Animated rotating tagline */}
          <div className="mt-6 h-8 sm:h-10 relative overflow-hidden">
            {phrases.map((p, i) => (
              <motion.div
                key={p}
                className="absolute inset-0 flex items-center justify-center text-base sm:text-xl font-medium text-muted-foreground"
                initial={{ y: 30, opacity: 0 }}
                animate={{
                  y: [30, 0, 0, -30],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: phrases.length * 2.4,
                  times: [0, 0.08, 0.25, 0.33],
                  repeat: Infinity,
                  delay: i * 2.4,
                  ease: "easeInOut",
                }}
              >
                <span className="text-foreground">{p}</span>
              </motion.div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild className="bg-success text-success-foreground hover:bg-success/90 h-12 px-7 text-base font-semibold rounded-xl">
              <Link to="/signup">
                Try the Demo Account <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-7 rounded-xl bg-background/30 hover:bg-background/50 border-border">
              <Link to="/markets">Browse Markets</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            No credit card. No deposit. Just sign up and start trading with play money.
          </p>
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
        { l: "How It Works", to: "#how" },
        { l: "$OKO Token", to: "#token" },
        { l: "News Ecosystem", to: "#ecosystem" },
        { l: "Developers", to: "#build" },
      ],
    },
    {
      title: "Company",
      links: [
        { l: "About", to: "#" },
        { l: "Careers", to: "#" },
        { l: "Press", to: "#" },
        { l: "Contact", to: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { l: "Terms", to: "/terms" },
        { l: "Learn", to: "/learn" },
        { l: "Responsible Trading", to: "/learn/risk" },
        { l: "Disclaimer", to: "/learn/disclaimer" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60 mt-auto bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="grid gap-10 md:gap-8 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <Logo size="md" />
            <p className="mt-4 text-sm text-muted-foreground max-w-xs leading-relaxed">
              Africa's prediction market. Trade outcomes on the events shaping the continent —
              with information, not luck.
            </p>
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2.5">
                Pay with
              </div>
              <PaymentBadges />
            </div>
          </div>

          {/* Link columns */}
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
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              All systems operational
            </span>
            <span className="font-mono">Made in Nairobi 🇰🇪</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { l: string; to: string }[];
}) {
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

/* ───────────────────────────────  CHART HELPERS  ─────────────────────────────── */

function buildSeries(n: number, start: number, end: number) {
  const out: number[] = [];
  let v = start;
  const drift = (end - start) / n;
  for (let i = 0; i < n; i++) {
    v = Math.max(0.05, Math.min(0.95, v + drift + (Math.random() - 0.5) * 0.04));
    out.push(v);
  }
  return out;
}

function BigChart({ points, className, mini }: { points: number[]; className?: string; mini?: boolean }) {
  if (points.length < 2) return <div className={className} />;
  const W = 300;
  const H = mini ? 60 : 180;
  const stepX = W / (points.length - 1);
  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = Math.max(0.0001, maxV - minV);
  const pad = mini ? 4 : 12;

  const ys = points.map((p) => pad + (1 - (p - minV) / range) * (H - pad * 2));
  const path = ys.map((y, i) => `${i === 0 ? "M" : "L"}${i * stepX},${y}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const lastX = (points.length - 1) * stepX;
  const lastY = ys[ys.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} style={{ width: "100%" }}>
      <defs>
        <linearGradient id={`g-${mini ? "m" : "l"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.22 150)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.78 0.22 150)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {!mini && (
        <g stroke="oklch(0.95 0.01 280 / 0.06)" strokeWidth="1">
          <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} />
          <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} />
          <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} />
        </g>
      )}
      <path d={area} fill={`url(#g-${mini ? "m" : "l"})`} />
      <path d={path} fill="none" stroke="oklch(0.78 0.22 150)" strokeWidth={mini ? 1.4 : 2} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={mini ? 1.6 : 3} fill="oklch(0.78 0.22 150)" />
      {!mini && <circle cx={lastX} cy={lastY} r="6" fill="oklch(0.78 0.22 150)" opacity="0.25" />}
    </svg>
  );
}
