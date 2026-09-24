import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Trophy,
  Film,
  LineChart,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/markets/Sparkline";
import { NewsTape, type TapeItem } from "@/components/markets/NewsTape";
import { CATEGORY_LABEL, formatKESCompact, formatOneDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountdownPill } from "@/components/engagement/CountdownPill";

export interface CinemaMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
  image_url?: string | null;
  closes_at?: string | null;
}

interface Props {
  market: CinemaMarket;
  history: number[];
  tapeItems: TapeItem[];
  pulseKey?: number;
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  politics: Landmark,
  sports: Trophy,
  entertainment: Film,
  economics: LineChart,
};

export function MarketCardCinema({ market, history, tapeItems, pulseKey }: Props) {
  const yes = Number(market.yes_price);
  const showYes = yes >= 0.5;
  const dominant = showYes ? yes : 1 - yes;
  const ksh = Math.round(dominant * 100);
  const change = history.length >= 2 ? yes - history[0] : 0;
  const changePct = history.length >= 2 && history[0] > 0 ? (change / history[0]) * 100 : 0;
  const up = changePct >= 0;
  const dominantColor = showYes ? "text-success" : "text-destructive";
  const dominantBar = showYes ? "bg-success" : "bg-destructive";

  return (
    <Link
      to="/markets/$slug"
      params={{ slug: market.slug }}
      search={{}}
      className="group block rounded-2xl border border-border bg-card p-4 sm:p-5 transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
    >
      {/* Header: category + change */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            {CATEGORY_LABEL[market.category] ?? market.category}
          </Badge>
          <CountdownPill closesAt={market.closes_at ?? null} />
        </div>
        <span
          className={cn(
            "num inline-flex items-center gap-0.5 text-sm font-semibold",
            up ? "text-success" : "text-destructive",
          )}
        >
          {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {up ? "+" : ""}
          {formatOneDecimal(changePct)}%
        </span>
      </div>

      {/* Question + market icon */}
      <div className="mt-3 flex items-start gap-3">
        {market.image_url ? (
          <img
            src={market.image_url}
            alt=""
            loading="lazy"
            className="h-11 w-11 rounded-xl object-cover border border-border/60 shrink-0 ring-1 ring-primary/10"
          />
        ) : (
          (() => {
            const Icon = CATEGORY_ICON[market.category] ?? TrendingUp;
            return (
              <div className="h-11 w-11 rounded-xl bg-muted/40 border border-border/60 shrink-0 flex items-center justify-center text-muted-foreground">
                <Icon className="h-5 w-5" />
              </div>
            );
          })()
        )}
        <h3 className="text-base sm:text-lg font-semibold leading-snug line-clamp-2 min-h-[2.75rem] sm:min-h-[3.25rem] group-hover:text-primary-foreground transition flex-1">
          {market.question}
        </h3>
      </div>

      {/* News tape (slim) */}
      {tapeItems.length > 0 && (
        <div className="mt-3">
          <NewsTape items={tapeItems} pulseKey={pulseKey} />
        </div>
      )}

      {/* YES probability bar */}
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {showYes ? "Yes Probability" : "No Probability"}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-2 flex-1 rounded-full bg-muted/40 overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
                dominantBar,
              )}
              style={{ width: `${Math.max(2, Math.min(100, dominant * 100))}%` }}
            />
          </div>
          <span className={cn("num text-base font-bold whitespace-nowrap", dominantColor)}>
            KSh {ksh}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-3 -mx-1">
        <Sparkline points={history.length ? history : [yes, yes]} height={104} />
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-end justify-between">
        <span className="num text-xs text-muted-foreground">
          Vol {formatKESCompact(market.volume_cents)}
        </span>
        <span className={cn("num text-lg font-bold", dominantColor)}>KSh {ksh}</span>
      </div>
    </Link>
  );
}
