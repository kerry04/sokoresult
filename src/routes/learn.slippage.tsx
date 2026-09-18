import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/slippage")({
  head: () => ({
    meta: [
      { title: "Slippage & price impact — SokoResult" },
      { name: "description", content: "Understand why your trade moves the price and how to keep slippage small." },
      { property: "og:title", content: "Slippage & price impact" },
      { property: "og:description", content: "How LMSR pricing works and why bigger trades cost more per share." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">Slippage &amp; price impact</h1>

        <p className="text-muted-foreground">
          Every trade you place changes the market price. The bigger the trade relative to the market's depth, the more the price moves against you. This is called <strong className="text-foreground">slippage</strong>.
        </p>

        <h2 className="text-xl font-bold mt-6">Example</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Market price (YES)</span><span className="font-mono">KSh 60</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">You buy</span><span className="font-mono">100 shares</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Average price you pay</span><span className="font-mono">KSh 62.40</span></div>
          <div className="flex justify-between text-warning"><span>Slippage</span><span className="font-mono">+4%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">New market price after</span><span className="font-mono">KSh 65</span></div>
        </div>

        <h2 className="text-xl font-bold mt-6">How to keep slippage small</h2>
        <ul className="space-y-2 text-muted-foreground list-disc list-inside">
          <li>Trade in smaller chunks instead of one giant trade.</li>
          <li>Look at the slippage preview in the trade ticket before confirming.</li>
          <li>Prefer markets with high liquidity (more depth = less slippage).</li>
        </ul>

        <div className="flex gap-3 pt-4">
          <Link to="/learn/examples" className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">Next: Worked examples →</Link>
        </div>
      </article>
    </div>
  );
}
