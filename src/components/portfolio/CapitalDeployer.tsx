import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Sparkles, Target, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatKESCompact, formatPercent, CATEGORY_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MarketSlim {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  keywords: string[] | null;
  trend_hit?: string | null;
  reason?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userCategories: string[]; // categories the user has already traded
}

type Tab = "trending" | "hot" | "for-you";

export function CapitalDeployer({ open, onClose, userCategories }: Props) {
  const [tab, setTab] = useState<Tab>("trending");
  const [items, setItems] = useState<MarketSlim[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let abort = false;
    (async () => {
      setLoading(true);

      const [{ data: marketsRaw }, { data: trends }] = await Promise.all([
        supabase
          .from("markets")
          .select("id, slug, question, category, yes_price, no_price, volume_cents, keywords")
          .eq("status", "open"),
        supabase
          .from("trending_keywords")
          .select("keyword, trend_score")
          .order("trend_score", { ascending: false })
          .limit(15),
      ]);
      if (abort) return;

      const markets = (marketsRaw ?? []) as MarketSlim[];
      const trendKeywords = (trends ?? []).map((t: any) => ({
        keyword: (t.keyword as string).toLowerCase(),
        score: Number(t.trend_score),
      }));

      let result: MarketSlim[] = [];

      if (tab === "trending") {
        // markets whose keywords intersect a hot keyword, ranked by combined trend score
        result = markets
          .map((m) => {
            const kws = (m.keywords ?? []).map((k) => k.toLowerCase());
            let bestScore = 0;
            let hit: string | null = null;
            for (const t of trendKeywords) {
              if (kws.includes(t.keyword) && t.score > bestScore) {
                bestScore = t.score;
                hit = t.keyword;
              }
            }
            return { ...m, _score: bestScore, trend_hit: hit };
          })
          .filter((m: any) => m._score > 0)
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 8)
          .map(({ _score, ...m }: any) => ({
            ...m,
            reason: m.trend_hit ? `Trending: "${m.trend_hit}"` : undefined,
          }));
      } else if (tab === "hot") {
        result = markets
          .slice()
          .sort((a, b) => b.volume_cents - a.volume_cents)
          .slice(0, 8)
          .map((m) => ({ ...m, reason: `Vol ${formatKESCompact(m.volume_cents)}` }));
      } else {
        // for-you: matches user categories
        const set = new Set(userCategories);
        const matches = markets.filter((m) => set.has(m.category));
        const fallback = markets.filter((m) => !set.has(m.category));
        result = [...matches, ...fallback].slice(0, 8).map((m) => ({
          ...m,
          reason: set.has(m.category)
            ? `You trade ${CATEGORY_LABEL[m.category] ?? m.category}`
            : "Try something new",
        }));
      }

      setItems(result);
      setLoading(false);
    })();
    return () => {
      abort = true;
    };
  }, [tab, open, userCategories]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-hidden rounded-t-3xl border border-border bg-card sm:inset-x-auto sm:right-6 sm:bottom-6 sm:top-20 sm:w-[480px] sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur px-5 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Capital Deployer
                </div>
                <h2 className="text-lg font-bold">Where to put your KES</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pt-4">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/40 p-1 text-xs">
                <TabBtn active={tab === "trending"} onClick={() => setTab("trending")} icon={Flame} label="Trending" />
                <TabBtn active={tab === "hot"} onClick={() => setTab("hot")} icon={Sparkles} label="Hot vol" />
                <TabBtn active={tab === "for-you"} onClick={() => setTab("for-you")} icon={Target} label="For you" />
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-2 max-h-[calc(85vh-150px)] sm:max-h-[calc(100vh-200px)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-lg border border-border bg-muted/20 animate-pulse" />
                ))
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No matches right now — try another tab.
                </div>
              ) : (
                items.map((m) => (
                  <Link
                    key={m.id}
                    to="/markets/$slug"
                    params={{ slug: m.slug }} search={{}}
                    onClick={onClose}
                    className="group block rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-primary/5 transition"
                  >
                    {m.reason && (
                      <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-primary-foreground">
                        {m.reason}
                      </div>
                    )}
                    <p className="text-sm font-medium leading-snug line-clamp-2">{m.question}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <div className="flex gap-2 font-mono">
                        <span className="text-success">YES {formatPercent(Number(m.yes_price))}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-destructive">NO {formatPercent(Number(m.no_price))}</span>
                      </div>
                      <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground opacity-0 group-hover:opacity-100 transition">
                        Trade →
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Flame;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition",
        active ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
