import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/examples")({
  head: () => ({
    meta: [
      { title: "Worked examples — SokoResult" },
      { name: "description", content: "Real-world examples of prediction market trades on SokoResult." },
      { property: "og:title", content: "Prediction market worked examples" },
      { property: "og:description", content: "Step-by-step examples of winning and losing trades." },
    ],
  }),
  component: Page,
});

function Example({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 text-sm text-muted-foreground space-y-2">{body}</div>
    </div>
  );
}

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">Worked examples</h1>

        <Example
          title="Winning trade — Election market"
          body={
            <>
              <p>"Will Candidate A win the Nairobi gubernatorial?" YES is trading at KSh 45.</p>
              <p>You buy 20 shares at an average of KSh 46 (slight slippage). Total cost: <strong className="text-foreground">KSh 920</strong>.</p>
              <p>Election day — Candidate A wins. Each share pays KSh 100. You receive <strong className="text-success">KSh 2,000</strong>. Profit: <strong className="text-success">KSh 1,080</strong>.</p>
            </>
          }
        />

        <Example
          title="Losing trade — Sports market"
          body={
            <>
              <p>"Will Harambee Stars qualify for AFCON?" YES is at KSh 70.</p>
              <p>You buy 10 shares at KSh 70. Total cost: <strong className="text-foreground">KSh 700</strong>.</p>
              <p>Stars lose the qualifier. Your shares pay KSh 0. Loss: <strong className="text-destructive">−KSh 700</strong>.</p>
            </>
          }
        />

        <Example
          title="Selling early to lock profit"
          body={
            <>
              <p>You bought NO at KSh 30. After breaking news, NO jumps to KSh 65.</p>
              <p>Instead of waiting for resolution, you sell. You receive close to KSh 65 per share — locking in the profit even though the event hasn't happened yet.</p>
            </>
          }
        />

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-6">
          These examples are illustrative only. Real trades involve real losses.
        </div>

        <div className="flex gap-3 pt-4">
          <Link to="/learn/disclaimer" className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">Next: Disclaimer →</Link>
        </div>
      </article>
    </div>
  );
}
