import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { recordSessionOnce } from "@/lib/fingerprint";
import { AchievementModal } from "@/components/engagement/AchievementModal";
import { PublicHeader } from "@/components/nav/PublicHeader";
import { MobileBottomNav } from "@/components/nav/MobileBottomNav";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    return { from: location.pathname };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, profile, loading, achievementQueue, dismissTopAchievement } = useAuth();
  const location = useLocation();
  const topAchievement = achievementQueue[0] ?? null;

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = `/login?redirect=${encodeURIComponent(location.pathname)}`;
    }
    if (user) recordSessionOnce();
  }, [loading, user, location.pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Same nav as the public board: top header on laptop, bottom tab bar
          on phones. No sidebar, no drawer menu — signed-in users get the
          account variant (Wallet instead of Learn). */}
      <PublicHeader />
      <KycBanner show={(profile?.kyc_tier ?? 0) === 0} />
      <main className="pb-[84px] md:pb-0">
        <Outlet />
      </main>
      <MobileBottomNav />
      <AchievementModal
        unlock={topAchievement}
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
