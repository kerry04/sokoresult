import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (!cancelled && data) setItems(data as Notification[]);
    };
    load();

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 15));
          // Jackpot feedback for winning resolutions
          const isWin =
            n.kind === "payout" ||
            n.kind === "resolution_win" ||
            /\bwon\b|payout|congratulations/i.test(`${n.title} ${n.body}`);
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

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative text-muted-foreground hover:text-foreground transition"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 max-h-[60vh] overflow-y-auto">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          items.map((n) => {
            const Inner = (
              <div
                className={cn(
                  "px-3 py-2.5 border-b border-border/50 hover:bg-accent/40 transition",
                  !n.read && "bg-primary/5",
                )}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  {n.title}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{n.body}</div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link as any}>
                {Inner}
              </Link>
            ) : (
              <div key={n.id}>{Inner}</div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
