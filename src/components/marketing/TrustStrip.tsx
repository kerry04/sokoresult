import { FileCheck2, History, LineChart } from "lucide-react";

/**
 * Trust built through the product — verifiable mechanics, not slogans.
 */
export function TrustStrip() {
  const items = [
    {
      icon: FileCheck2,
      t: "Clear resolution criteria",
      d: "Every market states exactly how it resolves and which sources decide the outcome — before you trade.",
    },
    {
      icon: LineChart,
      t: "Public price history",
      d: "Every price move is charted on the market page. No hidden books, no dark pools.",
    },
    {
      icon: History,
      t: "Your complete trade record",
      d: "Every fill is timestamped and visible in your portfolio, win or lose.",
    },
  ];

  return (
    <section
      aria-labelledby="trust-heading"
      className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Why traders trust a market
      </p>
      <h2 id="trust-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        The rules are the product
      </h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.t} className="flex gap-3.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-success">
                <Icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">{item.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.d}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
