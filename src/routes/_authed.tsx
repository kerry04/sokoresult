import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TrendingUp,
  Newspaper,
  PieChart,
  Wallet,
  User as UserIcon,
  LogOut,
  ShieldAlert,
  Trophy,
  X,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { usePriceFlash } from "@/hooks/use-price-flash";
import { useEffect, useState } from "react";
import { recordSessionOnce } from "@/lib/fingerprint";
import { NotificationBell } from "@/components/engagement/NotificationBell";
import { StreakBadge } from "@/components/engagement/StreakBadge";
import { AchievementModal } from "@/components/engagement/AchievementModal";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    return { from: location.pathname };
  },
  component: AuthedLayout,
});

const navItems = [
  { to: "/markets", icon: TrendingUp, label: "Markets" },
  { to: "/news", icon: Newspaper, label: "News" },
  { to: "/portfolio", icon: PieChart, label: "Portfolio" },
  { to: "/leaderboard", icon: Trophy, label: "Leaders" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
  { to: "/profile", icon: UserIcon, label: "Profile" },
] as const;

function AuthedLayout() {
  const { user, profile, loading, signOut, achievementQueue, dismissTopAchievement } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const topAchievement = achievementQueue[0] ?? null;

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = `/login?redirect=${encodeURIComponent(location.pathname)}`;
    }
    if (user) recordSessionOnce();
  }, [loading, user, location.pathname]);

  // Auto-close drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const initials = (profile?.display_name ?? user.email ?? "?")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl =
    profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 h-14 sm:h-16 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="h-full px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  className="md:hidden h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent active:scale-95 transition"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 bg-sidebar border-r border-border">
                <div className="flex h-full flex-col">
                  <div className="h-14 px-4 flex items-center border-b border-border">
                    <Logo size="md" />
                  </div>
                  <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.to ||
                        location.pathname.startsWith(item.to + "/");
                      return (
                        <Link
                          key={item.label}
                          to={item.to}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition active:scale-[0.98]",
                            isActive
                              ? "bg-primary/15 text-foreground border border-primary/30"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                  <div className="p-3 border-t border-border">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() =>
                        signOut().then(() => (window.location.href = "/"))
                      }
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/markets" className="flex items-center shrink-0">
              <Logo size="md" />
            </Link>
          </div>

          <div className="flex-1" />


          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <StreakBadge count={profile?.current_streak ?? 0} />
            <Badge
              variant="outline"
              className={cn(
                "hidden sm:inline-flex font-mono text-[10px]",
                (profile?.kyc_tier ?? 0) === 0
                  ? "border-warning/40 text-warning"
                  : "border-success/40 text-success",
              )}
            >
              KYC {profile?.kyc_tier ?? 0}
            </Badge>
            <NotificationBell />
            <BalancePill cents={profile?.kes_balance ?? null} />
            <Link to="/profile" className="ml-1 shrink-0" aria-label="Profile">
              <Avatar className="h-9 w-9 ring-2 ring-primary/40">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
                <AvatarFallback className="bg-primary/20 text-primary-foreground font-mono">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>

      <KycBanner show={(profile?.kyc_tier ?? 0) === 0} />

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar/60 flex-col p-4 gap-1 sticky top-16 self-start h-[calc(100vh-4rem)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.to ||
              location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                  isActive
                    ? "bg-primary/15 text-foreground border border-primary/30"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="mt-auto">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => signOut().then(() => (window.location.href = "/"))}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 pb-6">
          <Outlet />
        </main>
      </div>
      <AchievementModal
        unlock={topAchievement as any}
        open={!!topAchievement}
        onClose={dismissTopAchievement}
      />
    </div>
  );
}

function KycBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(localStorage.getItem("soko-kyc-dismissed") === "1");
    }
  }, []);
  if (!show || dismissed) return null;
  return (
    <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs sm:text-sm">
      <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-start sm:items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            Complete KYC to unlock real-money trading and M-Pesa withdrawals.{" "}
            <Link to="/kyc" className="underline font-medium hover:text-foreground">
              Verify now →
            </Link>
          </span>
        </div>
        <button
          onClick={() => {
            localStorage.setItem("soko-kyc-dismissed", "1");
            setDismissed(true);
          }}
          className="opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function BalancePill({ cents }: { cents: number | null }) {
  const value = cents ?? 0;
  const dir = usePriceFlash(value);
  return (
    <div
      className={cn(
        "text-right min-w-0 rounded-md px-2 py-1 transition-colors",
        dir === "up" && "flash-up",
        dir === "down" && "flash-down",
      )}
    >
      <div className="hidden sm:block text-[9px] uppercase text-muted-foreground tracking-[0.18em]">
        Balance
      </div>
      <div className="num text-xs sm:text-sm font-bold text-success truncate">
        {cents === null ? (
          "—"
        ) : (
          <>
            KSh{" "}
            <AnimatedNumber
              value={value / 100}
              format={(n) =>
                n.toLocaleString("en-KE", { maximumFractionDigits: 2 })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
