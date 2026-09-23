import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { CATEGORY_LABEL } from "@/lib/format";
import { priceChangePts, type ProductMarket } from "./product-market";
import { cn } from "@/lib/utils";

/**
 * Compact trending list: top markets by volume with rank + movement.
 * Falls back to labeled "coming soon" topics — never fake markets.
 */
export function TrendingMarkets({ markets }: { markets: ProductMarket[] }) {
  const top = [...markets].sort((a, b) => b.volume_cents - a.volume_cents).slice(0, 5);

  return (
    <section aria-labelledby="trending-heading">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-warning" aria-hidden />
        <h2 id="trending-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
          Trending now
        </h2>
      </div>

      {top.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 p-6">
          <p className="text-sm text-muted-foreground">
            Trending markets will appear here once trading begins. Topics we're watching:
          </p>
          <ul className="mt-3 space-y-2">
            {[
              "2027 Kenyan presidential race",
              "Harambee Stars AFCON qualification",
              "Kenya inflation rate",
            ].map((t) => (
              <li key={t} className="flex items-center justify-between text-sm">
                <span>{t}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                  Coming soon
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-border/60 rounded-xl border border-border bg-card">
          {top.map((m, i) => {
            const change = priceChangePts(m.history);
            const up = change !== null && change >= 0;
            return (
              <li key={m.id}>
                <Link
                  to="/markets/$slug"
                  params={{ slug: m.slug }}
                  search={{}}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-success/60"
                >
                  <span className="num w-6 shrink-0 text-sm font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.question}</span>
                    <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABEL[m.category] ?? m.category}
                    </span>
                  </span>
                  {change !== null && (
                    <span
                      className={cn(
                        "num hidden shrink-0 text-xs font-bold sm:inline",
                        up ? "text-success" : "text-destructive",
                      )}
                    >
                      {up ? "+" : "−"}
                      {Math.abs(change).toFixed(1)} pts
                    </span>
                  )}
                  <span className="num shrink-0 text-sm font-bold text-success">
                    {Math.round(m.yes_price * 100)}%
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
