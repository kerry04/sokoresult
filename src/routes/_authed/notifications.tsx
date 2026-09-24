import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getPreferences,
  savePreferences,
  listAlerts,
  deleteAlert,
  isNotReady,
  type NotificationPrefs,
  type PriceAlert,
} from "@/lib/notifications-client";
import { safeInternalLink, timeAgo } from "@/components/engagement/NotificationBell";
import { Bell, BellRing, Info, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authed/notifications")({
  head: () => ({ meta: [{ title: "Notifications — SokoResult" }] }),
  component: NotificationsPage,
});

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const PREF_ROWS: Array<{ key: keyof NotificationPrefs; label: string; hint: string }> = [
  { key: "payouts", label: "Payouts", hint: "When winnings land in your wallet." },
  { key: "resolutions", label: "Market resolutions", hint: "When a market you follow resolves." },
  { key: "trades", label: "Trade confirmations", hint: "When your buy or sell fills." },
  { key: "price_alerts", label: "Price alerts", hint: "When a market hits your alert level." },
  {
    key: "marketing",
    label: "Product news",
    hint: "Occasional launches and features. Off by default.",
  },
];

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [prefsNote, setPrefsNote] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[] | null>(null);
  const [alertsNote, setAlertsNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setItems((data ?? []) as Notification[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getPreferences();
        if (!cancelled) {
          setPrefs(p);
          setPrefsReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setPrefs({
            payouts: true,
            resolutions: true,
            trades: true,
            price_alerts: true,
            marketing: false,
          });
          setPrefsNote(
            isNotReady(e)
              ? "Preference sync isn't live yet — changes below stay on this device for now."
              : "Couldn't load preferences.",
          );
        }
      }
      try {
        const a = await listAlerts();
        if (!cancelled) setAlerts(a);
      } catch (e) {
        if (!cancelled) {
          setAlerts([]);
          setAlertsNote(
            isNotReady(e)
              ? "Price alerts aren't live yet — the alert database still needs to be switched on."
              : "Couldn't load price alerts.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const togglePref = async (key: keyof NotificationPrefs) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    if (!prefsReady) {
      try {
        localStorage.setItem("soko:prefs-local", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await savePreferences({ [key]: next[key] });
    } catch {
      setPrefs(prefs);
    }
  };

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  };

  const removeAlert = async (id: string) => {
    setAlerts((prev) => (prev ?? []).filter((a) => a.id !== id));
    try {
      await deleteAlert(id);
    } catch {
      /* list refreshes on next visit */
    }
  };

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Everything the market tells you, in one place.
          </p>
        </div>
        {items.some((i) => !i.read) && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </header>

      {/* List */}
      <section aria-label="All notifications">
        {loading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center">
            <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Payouts, market resolutions and price alerts will land here.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {items.map((n) => {
              const href = safeInternalLink(n.link);
              const row = (
                <div
                  className={cn(
                    "px-4 py-3 hover:bg-accent/40 transition",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <span className="truncate">{n.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              );
              return href ? (
                <Link key={n.id} to={href as never}>
                  {row}
                </Link>
              ) : (
                <div key={n.id}>{row}</div>
              );
            })}
          </Card>
        )}
      </section>

      {/* Price alerts */}
      <section aria-label="Price alerts">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
          <BellRing className="h-4 w-4" /> Price alerts
        </h2>
        {alerts === null ? (
          <Card className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </Card>
        ) : alertsNote ? (
          <Card className="p-4 text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" /> {alertsNote}
          </Card>
        ) : alerts.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No price alerts yet. Open a market and set one — we&apos;ll notify you when it hits your
            level.
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {alerts.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">
                    YES {a.direction === "above" ? "≥" : "≤"} {Math.round(a.threshold * 100)}%
                  </span>
                  {a.triggered && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      fired
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAlert(a.id)}
                  aria-label="Delete alert"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </Card>
        )}
        {!alertsNote && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Alerts are checked every few minutes once the scheduler is enabled. One notification per
            alert — it won&apos;t spam you.
          </p>
        )}
      </section>

      {/* Preferences */}
      <section aria-label="Notification preferences">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Preferences
        </h2>
        <Card className="divide-y divide-border overflow-hidden">
          {PREF_ROWS.map((row) => (
            <div key={row.key} className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">{row.hint}</div>
              </div>
              <Switch
                checked={prefs?.[row.key] ?? true}
                onCheckedChange={() => togglePref(row.key)}
                aria-label={row.label}
              />
            </div>
          ))}
        </Card>
        {prefsNote && (
          <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-px shrink-0" /> {prefsNote}
          </p>
        )}
      </section>
    </div>
  );
}
