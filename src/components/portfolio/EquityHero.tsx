import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { CountUp } from "@/components/marketing/CountUp";
import { formatKES } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  portfolioValueCents: number;
  unrealizedPnlCents: number;
  realizedPnlCents: number;
  onDeploy: () => void;
}

export function EquityHero({
  portfolioValueCents,
  unrealizedPnlCents,
  realizedPnlCents,
  onDeploy,
}: Props) {
  const totalPnl = unrealizedPnlCents + realizedPnlCents;
  const pnlUp = totalPnl >= 0;
  const value = portfolioValueCents / 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card to-card p-6"
    >
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-primary, var(--color-primary))" }}
      />
      <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Portfolio Value
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <h1 className="font-mono text-4xl sm:text-5xl font-bold tabular-nums">
              <CountUp to={value} prefix="KES " duration={1100} />
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs",
                pnlUp ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              {pnlUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {pnlUp ? "+" : ""}
              {formatKES(totalPnl)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Mini
              label="Unrealized"
              value={`${unrealizedPnlCents >= 0 ? "+" : ""}${formatKES(unrealizedPnlCents)}`}
              up={unrealizedPnlCents >= 0}
            />
            <Mini
              label="Realized"
              value={`${realizedPnlCents >= 0 ? "+" : ""}${formatKES(realizedPnlCents)}`}
              up={realizedPnlCents >= 0}
            />
          </div>
        </div>

        <button
          onClick={onDeploy}
          className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-glow transition hover:bg-primary/90 active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4 group-hover:rotate-12 transition" />
          Find your next trade
        </button>
      </div>
    </motion.div>
  );
}

function Mini({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm", up ? "text-success" : "text-destructive")}>{value}</div>
    </div>
  );
}
