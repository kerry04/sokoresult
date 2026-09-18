import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/how-to-trade")({
  head: () => ({
    meta: [
      { title: "How to trade — SokoResult" },
      { name: "description", content: "Step-by-step: how to place your first trade on SokoResult." },
      { property: "og:title", content: "How to place your first trade" },
      { property: "og:description", content: "A beginner-friendly walkthrough of trading on SokoResult." },
    ],
  }),
  component: Page,
});

const STEPS = [
  { n: 1, t: "Verify your account", d: "Submit your ID and a selfie. Trading is locked until you're verified — this protects your money and keeps the platform fraud-free." },
  { n: 2, t: "Top up your wallet", d: "Use M-Pesa to deposit KES into your SokoResult wallet. Minimum KSh 100." },
  { n: 3, t: "Pick a market", d: "Browse open markets. Read the question, the resolution source, and the close date." },
  { n: 4, t: "Choose an outcome", d: "Decide which side you think will win. The current price tells you what the crowd thinks." },
  { n: 5, t: "Set your quantity", d: "Each share pays KSh 100 if you win. Start small (1–10 shares) until you're comfortable." },
  { n: 6, t: "Review the slippage preview", d: "Bigger trades move the price against you. Check the average price you'll actually pay." },
  { n: 7, t: "Place the trade", d: "Confirm. Your shares appear in your portfolio immediately." },
  { n: 8, t: "Wait for resolution", d: "When the event ends, our team checks the official source and pays winners automatically." },
];

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">How to trade</h1>

        <ol className="space-y-4 mt-6">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-border bg-card p-4 flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">{s.n}</div>
              <div>
                <div className="font-semibold">{s.t}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-8">
          <strong>You can lose money.</strong> Never trade with funds you need for rent, food, or bills.
        </div>

        <div className="flex gap-3 pt-4">
          <Link to="/learn/risk" className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">Next: Risk management →</Link>
        </div>
      </article>
    </div>
  );
}
