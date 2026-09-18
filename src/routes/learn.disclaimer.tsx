import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/disclaimer")({
  head: () => ({
    meta: [
      { title: "Disclaimer — SokoResult" },
      { name: "description", content: "Important disclaimer about trading prediction markets on SokoResult." },
      { property: "og:title", content: "SokoResult disclaimer" },
      { property: "og:description", content: "Read this before you trade." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-foreground">← Back to Learn</Link>
        <h1 className="text-3xl font-bold tracking-tight">Disclaimer</h1>

        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Trading prediction markets involves real financial risk. You can lose all the money you deposit. Never trade with funds you cannot afford to lose.</strong>
        </div>

        <ul className="space-y-3 text-muted-foreground text-sm list-disc list-inside">
          <li>SokoResult is not financial, investment, or legal advice. Anything you read on this site or from other users is opinion, not advice.</li>
          <li>Past performance does not guarantee future results. A market that "always" resolves a certain way can still surprise you.</li>
          <li>Markets can be wrong. The crowd's estimate is just an estimate.</li>
          <li>You must be 18+ and a resident of a jurisdiction where prediction markets are legal.</li>
          <li>If you feel you have a gambling problem, please pause trading and contact <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer" className="underline text-foreground">Gambling Therapy</a> or reach out to <Link to="/support" className="underline text-foreground">our support team</Link> to set self-exclusion.</li>
        </ul>

        <p className="text-sm text-muted-foreground pt-4">
          For full terms see the <Link to="/terms" className="underline text-foreground">Terms &amp; Conditions</Link>.
        </p>
      </article>
    </div>
  );
}
