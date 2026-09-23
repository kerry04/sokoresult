import { CATEGORY_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RailCategory {
  /** DB category value, or "all" / "trending". Unknown keys → intentional empty state. */
  key: string;
  label: string;
}

export const RAIL_CATEGORIES: RailCategory[] = [
  { key: "all", label: "All" },
  { key: "trending", label: "Trending" },
  { key: "kenya_politics", label: "Kenya Politics" },
  { key: "elections", label: "Elections" },
  { key: "epl", label: "EPL" },
  { key: "harambee_stars", label: "Harambee Stars" },
  { key: "business", label: "Business" },
  { key: "economy", label: "Economy" },
  { key: "technology", label: "Technology" },
  { key: "entertainment", label: "Entertainment" },
  { key: "africa", label: "Africa" },
  { key: "crypto", label: "Crypto" },
];

/** DB categories that actually exist today. Rail keys map onto these. */
const KEY_TO_DB: Record<string, string> = {
  kenya_politics: "politics",
  elections: "politics",
  epl: "sports",
  harambee_stars: "sports",
  business: "economics",
  economy: "economics",
  technology: "technology",
  africa: "politics",
  crypto: "crypto",
};

export function railKeyToDbCategory(key: string): string | null {
  if (key === "all" || key === "trending") return null;
  if (CATEGORY_LABEL[key]) return key; // real DB category
  return KEY_TO_DB[key] ?? key; // topic → closest DB category (may yield empty state)
}

/**
 * Compact horizontally scrollable category rail. Subtle chips, no cards.
 * Selected state uses the SokoResult neon-green accent.
 */
export function CategoryRail({
  active,
  onChange,
}: {
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Market categories"
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {RAIL_CATEGORIES.map((c) => {
        const selected = active === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-pressed={selected}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
              selected
                ? "bg-success font-semibold text-success-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </nav>
  );
}
