import { useEffect, useState } from "react";
import { ArrowLeftRight, Bell, BellRing, Flag, Info, Loader2, Trophy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { playJackpot } from "@/lib/sound";
import { fireBigConfetti } from "@/components/engagement/ConfettiBurst";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

function KindIcon({ kind }: { kind: string }) {
  const cls = "h-4 w-4 shrink-0 mt-0.5";
  switch (kind) {
    case "payout":
    case "resolution_win":
      return <Trophy className={cn(cls, "text-success")} />;
    case "resolution":
    case "resolution_loss":
      return <Flag className={cn(cls, "text-muted-foreground")} />;
    case "price_alert":
      return <BellRing className={cn(cls, "text-primary")} />;
    case "trade":
      return <ArrowLeftRight className={cn(cls, "text-muted-foreground")} />;
    case "system":
      return <Info className={cn(cls, "text-muted-foreground")} />;
    default:
      return <Bell className={cn(cls, "text-muted-foreground")} />;
  }
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

/** Only same-app paths may be rendered as links — never external URLs. */
export function safeInternalLink(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  return null;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (cancelled) return;
      if (err) {
        setError("Couldn't load notifications.");
      } else {
        setItems((data ?? []) as Notification[]);
      }
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 15));
          // Restrained celebration: only real payouts / wins.
          const isWin = n.kind === "payout" || n.kind === "resolution_win";
          if (isWin) {
            playJackpot();
            fireBigConfetti();
          }
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

  const unread = items.filter((i) => !i.read).length;

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative text-muted-foreground hover:text-foreground transition"
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 max-h-[70vh] overflow-y-auto">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between sticky top-0 bg-popover z-10">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="px-3 py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
          </div>
        ) : error ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs font-medium">You&apos;re all caught up</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Payouts, market resolutions and price alerts will land here.
            </p>
          </div>
        ) : (
          items.map((n) => {
            const href = safeInternalLink(n.link);
            const Inner = (
              <div
                className={cn(
                  "flex gap-2.5 px-3 py-2.5 border-b border-border/50 hover:bg-accent/40 transition",
                  !n.read && "bg-primary/5",
                )}
              >
                <KindIcon kind={n.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <span className="truncate">{n.title}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {n.body}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground/70">
                    {timeAgo(n.created_at)}
                  </div>
                </div>
              </div>
            );
            return href ? (
              <Link key={n.id} to={href as never} onClick={() => markRead(n.id)}>
                {Inner}
              </Link>
            ) : (
              <div key={n.id} onClick={() => markRead(n.id)} className="cursor-pointer">
                {Inner}
              </div>
            );
          })
        )}

        <Link
          to="/notifications"
          className="block px-3 py-2.5 text-center text-[11px] font-medium text-primary hover:underline"
        >
          View all &amp; preferences
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
