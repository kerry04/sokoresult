import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { BackButton } from "@/components/common/BackButton";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — SokoResult" },
      { name: "description", content: "Understand prediction markets, how to trade safely, manage risk, and read prices on SokoResult." },
      { property: "og:title", content: "Learn prediction markets — SokoResult" },
      { property: "og:description", content: "Free beginner-friendly guides to trading prediction markets safely in Kenya." },
    ],
  }),
  component: LearnLayout,
});

function LearnLayout() {
  return (
    <div className="min-h-screen bg-background">
      <LearnHeader />
      <Outlet />
    </div>
  );
}

export function LearnHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallback="/markets" label="Back" className="-ml-2" />
          <Link to="/" className="font-bold tracking-tight hidden sm:block"><Logo size="sm" /></Link>
        </div>
        <nav className="flex gap-4 text-sm text-muted-foreground items-center">
          <Link to="/learn" className="hover:text-foreground" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground font-medium" }}>Learn</Link>
          <Link to="/markets" className="hover:text-foreground">Markets</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
        </nav>
      </div>
    </header>
  );
}
