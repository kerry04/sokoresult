import { ProbabilityNote } from "@/components/markets/ProbabilityNote";

/**
 * Compact 3-step explainer. The probability concept is taught inline
 * (step 2) instead of in a giant educational section.
 */
export function HowItWorksStrip() {
  const steps = [
    {
      n: "1",
      t: "Pick a market",
      d: "Browse open markets on Kenyan politics, football, business, and culture — events you actually follow.",
    },
    {
      n: "2",
      t: "Buy Yes or No",
      d: "Shares are priced KSh 0–100. A Yes price of KSh 64 means the market thinks there's about a 64% chance.",
      note: true,
    },
    {
      n: "3",
      t: "Sell anytime or hold",
      d: "Sell early when the price moves in your favour, or hold to resolution. Winnings settle in KES.",
    },
  ];

  return (
    <section
      aria-labelledby="how-heading"
      className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        How it works
      </p>
      <h2 id="how-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        Trade what you believe
      </h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
        {steps.map((s) => (
          <div key={s.n} className="border-t-2 border-success/40 pt-4">
            <div className="num text-sm font-bold text-success">{s.n}</div>
            <h3 className="mt-1.5 flex items-center gap-1.5 text-[15px] font-semibold">
              {s.t}
              {s.note && <ProbabilityNote price={0.64} />}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
