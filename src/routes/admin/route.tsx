import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  Shield,
  LayoutDashboard,
  BarChart3,
  Plus,
  LogOut,
  Loader2,
  ShieldCheck,
  Newspaper,
  Users,
  LifeBuoy,
  Activity,
  AlertTriangle,
  Users2,
  Radio,
  HeartPulse,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const adminNav = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { to: "/admin/markets", icon: BarChart3, label: "Markets", exact: false },
  { to: "/admin/markets/create", icon: Plus, label: "Create Market", exact: true },
  { to: "/admin/suggestions", icon: Sparkles, label: "Review Queue", exact: true },
  { to: "/admin/trades", icon: Activity, label: "Trades", exact: false },
  { to: "/admin/edge", icon: TrendingUp, label: "Edge Opportunities", exact: false },
  { to: "/admin/alerts", icon: AlertTriangle, label: "Alerts", exact: false },
  { to: "/admin/users", icon: Users, label: "Users", exact: false },
  { to: "/admin/syndicates", icon: Users2, label: "Syndicates", exact: false },
  { to: "/admin/news", icon: Newspaper, label: "News Intel", exact: false },
  { to: "/admin/signals", icon: Radio, label: "Signals", exact: false },
  { to: "/admin/health", icon: HeartPulse, label: "Health", exact: false },
  { to: "/admin/kyc", icon: ShieldCheck, label: "KYC Review", exact: false },
  { to: "/admin/support", icon: LifeBuoy, label: "Support", exact: false },
] as const;

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Skip guard for /admin/login
  const isLoginRoute = location.pathname === "/admin/login";

  useEffect(() => {
    if (isLoginRoute) {
      setChecking(false);
      return;
    }
    if (loading) return;
    if (!user) {
      navigate({ to: "/admin/login" });
      return;
    }
    // Verify admin role via secure RPC (server-side)
    (async () => {
      const { data: isAdminFlag, error } = await (supabase.rpc as any)("is_current_user_admin");
      if (error || !isAdminFlag) {
        await supabase.auth.signOut();
        navigate({ to: "/admin/login" });
        return;
      }
      setIsAdmin(true);
      setChecking(false);
    })();
  }, [user, loading, isLoginRoute, navigate]);

  if (isLoginRoute) return <Outlet />;

  if (checking || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying admin access…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0A0A14]">
      <aside className="w-[240px] shrink-0 border-r border-destructive/20 bg-card/40 flex flex-col p-4 gap-1 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-6 px-1">
          <Logo size="sm" />
          <span className="ml-1 px-2 py-0.5 rounded-md bg-destructive/15 text-destructive text-[10px] font-mono uppercase tracking-wider border border-destructive/30">
            <Shield className="h-3 w-3 inline mr-1" /> Admin
          </span>
        </div>
        {adminNav.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.label}
              to={item.to as any}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                active
                  ? "bg-destructive/15 text-foreground border border-destructive/30"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <div className="mt-auto space-y-1">
          <div className="px-3 py-2 text-[11px] text-muted-foreground truncate">{user?.email}</div>
          <Link
            to="/markets"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ← Back to app
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => signOut().then(() => navigate({ to: "/admin/login" }))}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
