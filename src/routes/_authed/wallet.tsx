import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useLang, type StringKey } from "@/lib/i18n";
import { formatKES } from "@/lib/format";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
  Receipt,
  Filter,
  Loader2,
  CheckCircle2,
  Phone,
  ShieldAlert,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getPaymentStatus,
  startDeposit,
  verifyDeposit,
  type PaymentStatus,
} from "@/lib/payments-client";

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

const TYPE_FILTERS: Array<{ key: string; labelKey: StringKey }> = [
  { key: "all", labelKey: "wallet.filterAll" },
  { key: "trade", labelKey: "wallet.filterTrade" },
  { key: "deposit", labelKey: "wallet.filterDeposit" },
  { key: "withdrawal", labelKey: "wallet.filterWithdrawal" },
  { key: "payout", labelKey: "wallet.filterPayout" },
];

function WalletPage() {
  const { profile, user, refreshProfile } = useAuth();
  const { t: tr } = useLang();
  const balance = profile?.kes_balance ?? 0;
  const kycTier = profile?.kyc_tier ?? 0;
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [payStatus, setPayStatus] = useState<PaymentStatus | null>(null);

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
    getPaymentStatus().then(setPayStatus);
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

  const byDay = new Map<string, Txn[]>();
  filtered.forEach((t) => {
    const d = new Date(t.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key =
      d.toDateString() === today.toDateString()
        ? tr("wallet.today")
        : d.toDateString() === yesterday.toDateString()
          ? tr("wallet.yesterday")
          : d.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  });

  const depositsEnabled = payStatus?.depositsEnabled ?? false;
  const testMode = payStatus?.testMode ?? false;

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          {tr("wallet.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{tr("wallet.subtitle")}</p>
      </header>

      {/* Hero balance card */}
      <Card className="relative overflow-hidden p-6 sm:p-8 text-center bg-gradient-to-br from-primary/15 via-card to-success/10 border-primary/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-success/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {tr("wallet.balance")}
          </div>
          <div
            className="mt-2 text-4xl sm:text-5xl font-bold text-success tabular-nums"
            style={{ fontFamily: "var(--font-nums)" }}
          >
            {formatKES(balance)}
          </div>
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            <DepositDialog payStatus={payStatus} kycTier={kycTier} onCredited={refreshProfile} />
            <WithdrawButton withdrawalsEnabled={payStatus?.withdrawalsEnabled ?? false} />
          </div>
        </div>
      </Card>

      {/* Honest money-state banners */}
      {!payStatus ? (
        <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking payment status…
        </Card>
      ) : !depositsEnabled ? (
        <div className="flex items-start gap-3 rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 text-sm">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
          <div>
            <strong>Real-money deposits aren&apos;t connected yet.</strong> Your KES 10,000 demo
            balance is free to trade with. We&apos;ll switch this on as soon as the M-Pesa rail is
            live — no action needed from you.
          </div>
        </div>
      ) : testMode ? (
        <div className="flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/30 px-4 py-3 text-sm">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <div>
            <strong>Test mode.</strong> Deposits below use the Paystack test rail — no real money
            moves. Use the test M-Pesa number <span className="font-mono">+254710000000</span>.
          </div>
        </div>
      ) : null}

      {depositsEnabled && kycTier < 1 && (
        <div className="flex items-start gap-3 rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
          <div>
            <strong>Verify your identity to deposit.</strong>{" "}
            <Link to="/kyc" className="underline font-medium">
              Complete verification
            </Link>{" "}
            — it takes a couple of minutes.
          </div>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat
          label={tr("wallet.inflows")}
          value={formatKES(stats.inflow)}
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
          tone="success"
        />
        <MiniStat
          label={tr("wallet.outflows")}
          value={formatKES(stats.outflow)}
          icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
          tone="destructive"
        />
        <MiniStat
          label={tr("wallet.trades")}
          value={String(stats.tradeCount)}
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
        />
        <MiniStat
          label={tr("wallet.realized")}
          value={`${stats.realized >= 0 ? "+" : ""}${formatKES(stats.realized)}`}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone={stats.realized >= 0 ? "success" : "destructive"}
        />
      </div>

      {/* Demo notice — only while real deposits are off */}
      {!depositsEnabled && (
        <div className="flex items-start gap-3 rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 text-warning text-sm">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            🎮 <strong>Demo credits</strong> — KES 10,000 free to trade. Real M-Pesa coming soon.
          </div>
        </div>
      )}

      {/* Activity */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4" /> {tr("wallet.activity")}
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
                {tr(f.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {tr("wallet.loading")}
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Receipt className="h-6 w-6 mx-auto mb-2 opacity-40" />
            {tr("wallet.noTxns")}
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
                        return { Icon: ArrowUpFromLine, cls: "bg-destructive/15 text-destructive" };
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
                            "text-sm tabular-nums",
                            positive ? "text-success" : "text-foreground",
                          )}
                          style={{ fontFamily: "var(--font-nums)" }}
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
          "mt-1 text-base font-bold tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
        style={{ fontFamily: "var(--font-nums)" }}
      >
        {value}
      </div>
    </Card>
  );
}

type DepositPhase = "idle" | "starting" | "waiting" | "done" | "error";

function DepositDialog({
  payStatus,
  kycTier,
  onCredited,
}: {
  payStatus: PaymentStatus | null;
  kycTier: number;
  onCredited: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<DepositPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const { t: tr } = useLang();

  const enabled = payStatus?.depositsEnabled ?? false;
  const min = payStatus?.minDepositKes ?? 100;
  const max = payStatus?.maxDepositKes ?? 50000;
  const verified = kycTier >= 1;

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const reset = () => {
    setPhase("idle");
    setError(null);
    setReference(null);
    if (pollRef.current) window.clearInterval(pollRef.current);
  };

  const start = async () => {
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt < min) {
      setError(`Minimum deposit is KSh ${min.toLocaleString()}.`);
      return;
    }
    if (amt > max) {
      setError(`Maximum single deposit is KSh ${max.toLocaleString()}.`);
      return;
    }
    if (!phone.trim()) {
      setError("Enter the M-Pesa phone number.");
      return;
    }
    setPhase("starting");
    setError(null);
    const res = await startDeposit(amt, phone.trim());
    if (!res.ok || !res.reference) {
      setPhase("error");
      setError(res.error ?? "Could not start the deposit. Try again.");
      if (res.kycRequired) {
        toast.error("Complete verification first", {
          description: "Deposits need a verified identity.",
        });
      }
      return;
    }
    setReference(res.reference);
    setPhase("waiting");

    // Poll for up to ~3 minutes (STK push window is ~180s).
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 190_000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("error");
        setError(
          "We didn't get a confirmation. If M-Pesa took the money, it will land automatically — check back in a few minutes or contact support.",
        );
        return;
      }
      const v = await verifyDeposit(res.reference!);
      if (v.ok && v.credited) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("done");
        await onCredited();
        toast.success(`Deposited KSh ${Number(amount).toLocaleString()}`, {
          description: v.already
            ? "This deposit was already credited."
            : "Your balance is updated.",
        });
      } else if (v.ok && (v.status === "failed" || v.status === "abandoned")) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setPhase("error");
        setError("The M-Pesa payment didn't go through. No money was taken — try again.");
      } else if (!v.ok && v.error) {
        // Keep polling on transient errors; surface only hard failures.
      }
    }, 5000);
  };

  const close = (v: boolean) => {
    setOpen(v);
    if (!v) {
      reset();
      setAmount("");
      setPhone("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button
          className="gap-2 bg-success text-background hover:bg-success/90"
          disabled={!enabled}
          title={!enabled ? "Real-money deposits aren't connected yet" : "Deposit via M-Pesa"}
        >
          <ArrowDownToLine className="h-4 w-4" /> {tr("wallet.deposit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Deposit via M-Pesa</DialogTitle>
          <DialogDescription>
            We send an STK push to your phone — enter your M-Pesa PIN to approve. Funds land
            automatically once M-Pesa confirms.
          </DialogDescription>
        </DialogHeader>

        {phase === "waiting" ? (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-success/15 flex items-center justify-center">
              <Phone className="h-6 w-6 text-success animate-pulse" />
            </div>
            <div>
              <div className="font-semibold">Check your phone</div>
              <p className="text-sm text-muted-foreground mt-1">
                An M-Pesa prompt was sent to{" "}
                <span className="font-medium text-foreground">{phone}</span>. Enter your PIN to
                approve KSh {Number(amount).toLocaleString()}.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for M-Pesa confirmation…
            </div>
            <p className="text-[11px] text-muted-foreground">
              Reference <span className="font-mono">{reference}</span>
            </p>
          </div>
        ) : phase === "done" ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <div className="font-semibold">Deposit confirmed</div>
            <p className="text-sm text-muted-foreground">
              KSh {Number(amount).toLocaleString()} is now in your wallet.
            </p>
            <Button onClick={() => close(false)} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!verified && (
              <div className="rounded-lg bg-warning/15 border border-warning/30 px-3 py-2.5 text-xs flex gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
                <span>
                  You&apos;ll need to{" "}
                  <Link to="/kyc" className="underline font-medium" onClick={() => close(false)}>
                    verify your identity
                  </Link>{" "}
                  before the deposit goes through.
                </span>
              </div>
            )}
            <div>
              <Label htmlFor="dep-amt">Amount (KES)</Label>
              <Input
                id="dep-amt"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder={`Min ${min}`}
                className="text-lg mt-1 tabular-nums"
                style={{ fontFamily: "var(--font-nums)" }}
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
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Min KSh {min.toLocaleString()} · Max KSh {max.toLocaleString()} per deposit
              </p>
            </div>
            <div>
              <Label htmlFor="dep-phone">M-Pesa phone</Label>
              <Input
                id="dep-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712 345 678"
                className="mt-1"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        {phase !== "waiting" && phase !== "done" && (
          <DialogFooter>
            <Button
              onClick={start}
              disabled={phase === "starting"}
              className="w-full bg-success text-background hover:bg-success/90"
            >
              {phase === "starting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending push…
                </>
              ) : (
                "Send M-Pesa prompt"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WithdrawButton({ withdrawalsEnabled }: { withdrawalsEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { t: tr } = useLang();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 bg-card border border-border text-foreground hover:bg-accent"
        >
          <ArrowUpFromLine className="h-4 w-4" /> {tr("wallet.withdraw")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Withdrawals</DialogTitle>
          <DialogDescription>
            {withdrawalsEnabled
              ? "Send your balance to your M-Pesa number."
              : "Withdrawals aren't available yet."}
          </DialogDescription>
        </DialogHeader>
        {!withdrawalsEnabled && (
          <div className="flex items-start gap-3 rounded-xl bg-warning/15 border border-warning/30 px-4 py-3 text-sm">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
            <div>
              We&apos;re still verifying our M-Pesa payout rail with our payment provider.
              Withdrawals stay off until every shilling can be traced end-to-end — your balance is
              safe and visible here in the meantime.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
