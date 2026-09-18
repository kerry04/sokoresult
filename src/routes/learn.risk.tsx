import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/risk")({
  head: () => ({
    meta: [
      { title: "Risk management — SokoResult" },
      { name: "description", content: "How to manage risk when trading prediction markets. Position sizing, bankroll management, and the 1% rule." },
      { property: "og:title", content: "Risk management for prediction markets" },
      { property: "og:description", content: "Trade smarter, lose less — the SokoResult risk management primer." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">Risk management</h1>

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          The single most important rule: <strong>only trade money you can afford to lose entirely.</strong>
        </div>

        <h2 className="text-xl font-bold mt-6">The 1–5% rule</h2>
        <p className="text-muted-foreground">
          Don't risk more than 1–5% of your total bankroll on any single market. If you have KSh 10,000 to trade with, that means KSh 100–500 per market — even if you feel confident.
        </p>

        <h2 className="text-xl font-bold mt-6">Diversify across markets</h2>
        <p className="text-muted-foreground">
          Putting your whole balance on one election or one match is gambling, not trading. Spread across 5–10 different markets to smooth out individual losses.
        </p>

        <h2 className="text-xl font-bold mt-6">Don't chase losses</h2>
        <p className="text-muted-foreground">
          After a losing market, the worst thing you can do is double down with bigger trades to "win it back". Take a break, review what happened, then come back to a fresh decision.
        </p>

        <h2 className="text-xl font-bold mt-6">Set deposit limits</h2>
        <p className="text-muted-foreground">
          Decide before you start how much you'll deposit per month. When you hit that limit, stop. If you need help, contact <Link to="/contact" className="underline text-foreground">support</Link> — we can help you set a self-exclusion period.
        </p>

        <div className="flex gap-3 pt-4">
          <Link to="/learn/slippage" className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">Next: Slippage →</Link>
        </div>
      </article>
    </div>
  );
}
