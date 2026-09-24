import { Link, useLocation } from "@tanstack/react-router";
import {
  Bell,
  LogOut,
  Newspaper,
  PieChart,
  TrendingUp,
  Trophy,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/engagement/NotificationBell";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: typeof TrendingUp;
  label: string;
}

/**
 * Desktop-only account sidebar. Laptops get the full terminal rail;
 * phones and tablets keep the top header + bottom tab bar.
 */
export function AccountSidebar() {
  const { pathname } = useLocation();
  const { t } = useLang();
  const { user, profile, signOut } = useAuth();

  const trade: NavItem[] = [
    { to: "/markets", icon: TrendingUp, label: t("tabs.markets") },
    { to: "/news", icon: Newspaper, label: "News" },
    { to: "/portfolio", icon: PieChart, label: t("tabs.portfolio") },
  ];
  const account: NavItem[] = [
    { to: "/wallet", icon: Wallet, label: t("tabs.wallet") },
    { to: "/leaderboard", icon: Trophy, label: "Leaders" },
    { to: "/notifications", icon: Bell, label: "Notifications" },
    { to: "/profile", icon: UserIcon, label: t("tabs.profile") },
  ];

  const initial = (profile?.display_name ?? user?.email ?? "S").trim().charAt(0).toUpperCase();
  const name = profile?.display_name ?? user?.email ?? "";

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <aside
      aria-label="Account navigation"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl lg:flex"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-border/40 px-5">
        <Link to="/" aria-label="SokoResult home">
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-5">
        <NavSection label="Trade" items={trade} pathname={pathname} />
        <NavSection label="Account" items={account} pathname={pathname} />
      </nav>

      <div className="shrink-0 border-t border-border/40 p-3">
        <div className="flex items-center justify-between px-2 pb-2">
          <NotificationBell />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
          <span
            aria-hidden
            className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-sm font-bold text-success"
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {name}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                  active
                    ? "bg-success/10 text-success"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-success transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
