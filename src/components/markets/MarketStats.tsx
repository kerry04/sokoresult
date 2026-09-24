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
 * Compact trading statistics — inline, mono numerals, no cards.
 * Values briefly flash green/red when they move.
 */
export function MarketStats({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 divide-x divide-border/50",
        "[&>*:not(:first-child)]:pl-5",
        className,
      )}
    >
      {items.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </dl>
  );
}
