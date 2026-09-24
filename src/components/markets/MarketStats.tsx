import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: string;
  /** Direction of the last change — drives flash + tone color. */
  tone?: "up" | "down" | "flat";
}

function Stat({ label, value, tone = "flat" }: StatItem) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      if (tone === "up" || tone === "down") {
        setFlash(tone);
        const id = window.setTimeout(() => setFlash(null), 650);
        return () => window.clearTimeout(id);
      }
    }
  }, [value, tone]);

  return (
    <div
      className={cn(
        "rounded-md px-1 py-0.5",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down",
      )}
    >
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "num mt-0.5 text-[15px] font-bold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-destructive",
          tone === "flat" && "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Compact trading statistics. On phones the stats sit in an even 3-column
 * row (no dividers, which look broken when wrapped); sm+ keeps the
 * inline divided row. Values briefly flash green/red when they move.
 */
export function MarketStats({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 sm:divide-x sm:divide-border/50",
        "sm:[&>*:not(:first-child)]:pl-5",
        className,
      )}
    >
      {items.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </dl>
  );
}
