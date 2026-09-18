import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/markets")({
  head: () => ({
    meta: [
      { title: "How prediction markets work — SokoResult" },
      { name: "description", content: "Learn how shares, prices and probabilities work on SokoResult prediction markets." },
      { property: "og:title", content: "How prediction markets work" },
      { property: "og:description", content: "A 5-minute guide to reading prediction market prices on SokoResult." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">How prediction markets work</h1>

        <p className="text-muted-foreground">
          A prediction market lets you trade shares on the outcome of a real-world event. Each share you own pays out <strong className="text-foreground">KSh 100</strong> if the outcome you backed wins, and <strong className="text-foreground">KSh 0</strong> if it doesn't.
        </p>

        <h2 className="text-xl font-bold mt-8">Prices = probabilities</h2>
        <p className="text-muted-foreground">
          The price of a share reflects what the crowd thinks the chance of that outcome is.
        </p>
        <ul className="space-y-1 text-muted-foreground list-disc list-inside">
          <li>YES at <strong className="text-foreground">KSh 67</strong> means the crowd thinks there's a 67% chance YES wins.</li>
          <li>If you buy 1 share at KSh 67 and YES wins, you receive KSh 100 (KSh 33 profit).</li>
          <li>If YES loses, your share pays KSh 0 — you lose the KSh 67.</li>
        </ul>

        <h2 className="text-xl font-bold mt-8">Why prices move</h2>
        <p className="text-muted-foreground">
          Every trade slightly nudges the price. As more people back YES, the YES price rises and NO falls — and vice versa. The market is constantly re-pricing based on collective opinion and news.
        </p>

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-8">
          <strong>You can lose money.</strong> Just because the crowd thinks something is likely doesn't mean it will happen.
        </div>

        <div className="flex gap-3 pt-4">
          <Link to="/learn/how-to-trade" className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">Next: How to trade →</Link>
        </div>
      </article>
    </div>
  );
}
