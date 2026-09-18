import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { formatKES } from "@/lib/format";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
  Receipt,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authed/wallet")({
  head: () => ({ meta: [{ title: "Wallet — SokoResult" }] }),
  component: WalletPage,
});

interface Txn {
  id: string;
  type: string;
  amount_cents: number;
  description: string | null;
  created_at: string;
}

const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "trade", label: "Trades" },
  { key: "deposit", label: "Deposits" },
  { key: "withdrawal", label: "Withdrawals" },
  { key: "payout", label: "Payouts" },
];

function WalletPage() {
  const { profile, user } = useAuth();
  const balance = profile?.kes_balance ?? 0;
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("transactions")
      .select("id, type, amount_cents, description, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setTxns((data ?? []) as Txn[]);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let tradeCount = 0;
    let realized = 0;
    for (const t of txns) {
      if (t.amount_cents > 0) inflow += t.amount_cents;
      else outflow += -t.amount_cents;
      if (t.type === "trade") tradeCount++;
      if (t.type === "trade" || t.type === "payout") realized += t.amount_cents;
    }
    return { inflow, outflow, tradeCount, realized };
  }, [txns]);

  const filtered = useMemo(
    () => (filter === "all" ? txns : txns.filter((t) => t.type === filter)),
    [filter, txns],
  );

  // Group by day
  const byDay = new Map<string, Txn[]>();
  filtered.forEach((t) => {
    const d = new Date(t.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key =
      d.toDateString() === today.toDateString()
        ? "Today"
        : d.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : d.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  });

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-foreground">
          Demo KES balance, deposits, withdrawals and trade settlements.
        </p>
      </header>

      {/* Hero balance card */}
      <Card className="relative overflow-hidden p-6 sm:p-8 text-center bg-gradient-to-br from-primary/15 via-card to-success/10 border-primary/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-success/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Available balance
          </div>
          <div
            className="mt-2 font-mono text-4xl sm:text-5xl font-bold text-success"
            style={{ fontFamily: "'Space Mono', ui-monospace, monospace" }}
          >
            {formatKES(balance)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Demo KES · resets on request
          </div>
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            <MoneyDialog kind="deposit" />
            <MoneyDialog kind="withdraw" />
          </div>
        </div>
      </Card>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat
          label="Inflows"
          value={formatKES(stats.inflow)}
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
          tone="success"
        />
        <MiniStat
          label="Outflows"
          value={formatKES(stats.outflow)}
          icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
          tone="destructive"
        />
        <MiniStat
          label="Trades"
          value={String(stats.tradeCount)}
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
        />
        <MiniStat
          label="Realized P&L"
          value={`${stats.realized >= 0 ? "+" : ""}${formatKES(stats.realized)}`}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone={stats.realized >= 0 ? "success" : "destructive"}
        />
      </div>

      {/* Demo notice */}
      <div className="flex items-start gap-3 rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 text-warning text-sm">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          🎮 <strong>Demo credits</strong> — KES 10,000 free to trade. Real M-Pesa coming soon.
        </div>
      </div>

      {/* Activity */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Activity
          </h2>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs whitespace-nowrap border transition flex items-center gap-1.5",
                  filter === f.key
                    ? "bg-primary/20 border-primary/50 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.key === "all" && <Filter className="h-3 w-3" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Receipt className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No transactions in this view.
          </Card>
        ) : (
          <div className="space-y-5">
            {Array.from(byDay.entries()).map(([day, items]) => (
              <div key={day}>
                <div className="text-xs text-muted-foreground mb-2 px-1">{day}</div>
                <Card className="divide-y divide-border overflow-hidden">
                  {items.map((t) => {
                    const positive = t.amount_cents > 0;
                    const cfg = (() => {
                      if (t.type === "deposit" || t.type === "payout")
                        return { Icon: ArrowDownToLine, cls: "bg-success/15 text-success" };
                      if (t.type === "withdrawal")
                        return {
                          Icon: ArrowUpFromLine,
                          cls: "bg-destructive/15 text-destructive",
                        };
                      if (t.type === "admin_reset")
                        return { Icon: Sparkles, cls: "bg-warning/15 text-warning" };
                      return { Icon: ArrowLeftRight, cls: "bg-primary/15 text-primary-foreground" };
                    })();
                    const Icon = cfg.Icon;
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <div
                          className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                            cfg.cls,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{t.description ?? t.type}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">
                            {t.type} ·{" "}
                            {new Date(t.created_at).toLocaleTimeString("en-KE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            positive ? "text-success" : "text-foreground",
                          )}
                        >
                          {positive ? "+" : ""}
                          {formatKES(t.amount_cents)}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "success" | "destructive";
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-base font-bold tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function MoneyDialog({ kind }: { kind: "deposit" | "withdraw" }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const isDeposit = kind === "deposit";

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt < 1) {
      toast.error("Enter a valid amount");
      return;
    }
    toast.success(
      isDeposit ? `STK push sent to ${phone || "your phone"}` : `Withdrawal of KES ${amt} requested`,
      { description: "Mock — real M-Pesa coming soon." },
    );
    setOpen(false);
    setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={cn(
            "gap-2",
            isDeposit
              ? "bg-success text-background hover:bg-success/90"
              : "bg-card border border-border text-foreground hover:bg-accent",
          )}
        >
          {isDeposit ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
          {isDeposit ? "Deposit" : "Withdraw"}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>{isDeposit ? "Deposit via M-Pesa" : "Withdraw to M-Pesa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="amt">Amount (KES)</Label>
            <Input
              id="amt"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="font-mono text-lg mt-1"
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[100, 500, 1000, 5000].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String((Number(amount) || 0) + n))}
                >
                  +{n}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="phone">M-Pesa phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            className={cn(
              "w-full",
              isDeposit
                ? "bg-success text-background hover:bg-success/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {isDeposit ? "Deposit via M-Pesa" : "Request withdrawal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
