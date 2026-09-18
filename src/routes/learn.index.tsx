import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, TrendingUp, AlertTriangle, Activity, Lightbulb, Shield } from "lucide-react";

export const Route = createFileRoute("/learn/")({
  component: LearnIndex,
});

const TOPICS = [
  { to: "/learn/markets", icon: BookOpen, title: "How prediction markets work", desc: "Shares, prices and probabilities — the basics." },
  { to: "/learn/how-to-trade", icon: TrendingUp, title: "How to place your first trade", desc: "A step-by-step walkthrough." },
  { to: "/learn/risk", icon: AlertTriangle, title: "Risk management", desc: "Position sizing, never trade money you can't afford to lose." },
  { to: "/learn/slippage", icon: Activity, title: "Slippage & price impact", desc: "Why your trade moves the price." },
  { to: "/learn/examples", icon: Lightbulb, title: "Worked examples", desc: "Real scenarios from Kenyan elections, sports and finance." },
  { to: "/learn/disclaimer", icon: Shield, title: "Disclaimer", desc: "Important things to know before you trade." },
] as const;

function LearnIndex() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Trading education hub</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        New to prediction markets? Start here. These guides explain how SokoResult works, how to read prices, and how to trade without losing money you can't afford to lose.
      </p>

      <div className="mt-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        <strong>You can lose money.</strong> Prediction market trades are real-money bets on uncertain events. Only trade with funds you can afford to lose.
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition group"
            >
              <Icon className="h-6 w-6 text-primary" />
              <div className="mt-3 font-semibold group-hover:text-primary transition">{t.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t.desc}</div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
