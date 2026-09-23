import { createFileRoute } from "@tanstack/react-router";
import { HowItWorksStrip } from "@/components/marketing/HowItWorksStrip";
import { MoneyStrip } from "@/components/marketing/MoneyStrip";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { TokenTeaser } from "@/components/marketing/TokenTeaser";

export const Route = createFileRoute("/learn/about")({
  head: () => ({
    meta: [{ title: "About SokoResult — Learn" }],
  }),
  component: AboutPage,
});

/**
 * The marketing content that used to sit on the homepage — how it works,
 * money in/out, trust & safety, and the $OKO token. The homepage now
 * starts with markets.
 */
function AboutPage() {
  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 sm:pt-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">About SokoResult</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          SokoResult is a prediction market built for Kenya and Africa. Pick a side on real-world
          events, set your stake, and trade probabilities — settling in KES.
        </p>
      </div>
      <HowItWorksStrip />
      <MoneyStrip />
      <TrustStrip />
      <TokenTeaser />
    </main>
  );
}
