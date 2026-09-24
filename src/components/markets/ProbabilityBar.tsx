import { cn } from "@/lib/utils";

interface Props {
  /** YES probability 0..100 */
  yesPct: number;
  className?: string;
}

/**
 * The market instrument: a green/red split whose boundary glides when the
 * probability changes and breathes via a subtle pulse. Widths animate with
 * CSS transitions — never snap.
 */
export function ProbabilityBar({ yesPct, className }: Props) {
  const yes = Math.min(100, Math.max(0, yesPct));
  const no = 100 - yes;

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50"
        role="img"
        aria-label={`Yes ${Math.round(yes)} percent, No ${Math.round(no)} percent`}
      >
        <div
          className="h-full rounded-l-full bg-success transition-[width] duration-700 ease-out"
          style={{ width: `${yes}%` }}
        />
        <div className="h-full flex-1 rounded-r-full bg-destructive/85 transition-[width] duration-700 ease-out" />
      </div>

      {/* The live boundary — glides with the price and subtly pulses. */}
      <div
        aria-hidden
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
        style={{ left: `${yes}%` }}
      >
        <div className="animate-boundary h-[18px] w-[2px] rounded-full bg-foreground shadow-[0_0_6px_var(--color-foreground)]" />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-success">
          Yes&nbsp;&nbsp;<span className="num">{Math.round(yes)}%</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-destructive">
          <span className="num">{Math.round(no)}%</span>&nbsp;&nbsp;No
        </span>
      </div>
    </div>
  );
}
