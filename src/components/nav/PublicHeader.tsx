import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/i18n";
import { NotificationBell } from "@/components/engagement/NotificationBell";
import { cn } from "@/lib/utils";

/**
 * Compact product header for the public site. h-14, serious fintech feel.
 * Mobile gets a drawer menu here + a bottom tab bar (MobileBottomNav).
 * Signed-in users get the account variant: Learn is replaced by Wallet and
 * the auth buttons become a Profile link.
 */
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const { user } = useAuth();

  const NAV: ReadonlyArray<{ label: string; to: string; hash: undefined }> = user
    ? [
        { label: t("nav.markets"), to: "/markets", hash: undefined },
        { label: t("nav.wallet"), to: "/wallet", hash: undefined },
      ]
    : [
        { label: t("nav.markets"), to: "/markets", hash: undefined },
        { label: t("nav.learn"), to: "/learn", hash: undefined },
      ];

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="SokoResult home" className="shrink-0">
          <Logo size="sm" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              hash={n.hash}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && <NotificationBell />}
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <Link to="/profile">{t("tabs.profile")}</Link>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                <Link to="/login">{t("nav.signin")}</Link>
              </Button>
              <Button
                size="sm"
                asChild
                className="hidden bg-success font-semibold text-success-foreground hover:bg-success/90 sm:inline-flex"
              >
                <Link to="/signup">{t("nav.startTrading")}</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
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
              key={n.to}
              to={n.to}
              hash={n.hash}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-[15px] text-foreground transition-colors hover:bg-accent"
            >
              {n.label}
            </Link>
          ))}
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-[15px] text-muted-foreground">{t("nav.appearance")}</span>
            <ThemeToggle />
          </div>
          {user ? (
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
            >
              {t("tabs.profile")}
            </Link>
          ) : (
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
            >
              {t("nav.signin")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
