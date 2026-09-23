import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Markets", to: "/markets", hash: undefined },
  { label: "Trending", to: "/", hash: "trending" },
  { label: "Learn", to: "/learn", hash: undefined },
] as const;

/**
 * Compact product header for the public site. h-14, serious fintech feel.
 * Mobile gets a drawer menu here + a bottom tab bar (MobileBottomNav).
 */
export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="SokoResult home" className="shrink-0">
          <Logo size="sm" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              hash={n.hash}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <Link to="/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className="bg-success font-semibold text-success-foreground hover:bg-success/90"
          >
            <Link to="/signup">Start Trading</Link>
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60 md:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "absolute inset-x-0 top-14 border-b border-border/60 bg-background/95 backdrop-blur-xl md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav aria-label="Mobile" className="flex flex-col px-4 py-3">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              hash={n.hash}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-[15px] text-foreground transition-colors hover:bg-accent"
            >
              {n.label}
            </Link>
          ))}
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-3 text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
