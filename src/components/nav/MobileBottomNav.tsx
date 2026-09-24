import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, Newspaper, PieChart, TrendingUp, User, Wallet, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Native-feel bottom tab bar for mobile and tablet. Fixed, with safe-area
 * padding so it never covers content awkwardly. lg+ is covered by the top
 * header (public pages) or the account sidebar (signed-in pages).
 * Signed-in users get the account variant: News replaces Markets, Learn is
 * replaced by Wallet, and the Trade shortcut goes to the markets board
 * instead of signup. Signed-out users get explicit login links (with
 * redirects) instead of tabs that bounce them unexpectedly.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { t } = useLang();
  const { user } = useAuth();

  const ITEMS = user
    ? [
        { label: "News", to: "/news", icon: Newspaper },
        { label: t("tabs.wallet"), to: "/wallet", icon: Wallet },
        { label: t("tabs.trade"), to: "/markets", icon: Zap, cta: true },
        { label: t("tabs.portfolio"), to: "/portfolio", icon: PieChart },
        { label: t("tabs.profile"), to: "/profile", icon: User },
      ]
    : [
        { label: t("tabs.markets"), to: "/markets", icon: TrendingUp },
        { label: t("tabs.learn"), to: "/learn", icon: BookOpen },
        { label: t("tabs.trade"), to: "/signup", icon: Zap, cta: true },
        {
          label: t("tabs.portfolio"),
          to: "/login",
          search: { redirect: "/portfolio" },
          icon: PieChart,
        },
        {
          label: t("tabs.profile"),
          to: "/login",
          search: { redirect: "/profile" },
          icon: User,
        },
      ];

  return (
    <nav
      aria-label="Mobile tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 px-2 pt-1.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          if (item.cta) {
            const ctaActive = pathname === "/markets" || pathname.startsWith("/markets/");
            return (
              <Link
                key={item.label}
                to={item.to}
                search={item.search}
                aria-label={t("nav.startTrading")}
                aria-current={ctaActive ? "page" : undefined}
                className="-mt-5 flex flex-col items-center gap-1 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full bg-success text-success-foreground shadow-card ring-4 transition",
                    ctaActive ? "ring-success" : "ring-background",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="pb-1 text-[10px] font-semibold text-success">{item.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.label}
              to={item.to}
              search={item.search}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                active ? "text-success" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="pb-1 text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
