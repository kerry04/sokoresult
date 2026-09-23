import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PaymentBadges } from "./PaymentBadges";

/**
 * KES + M-Pesa as a core product differentiator. Honest copy only —
 * no "instant withdrawal" claims the backend can't support.
 */
export function MoneyStrip() {
  return (
    <section aria-labelledby="money-heading" className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Built for Kenya
            </p>
            <h2 id="money-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Trade in KES. Withdraw to M-Pesa.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              No dollars, no crypto wallets, no conversions. Deposit and trade in Kenyan shillings,
              and withdraw winnings to the M-Pesa number on your verified account.
            </p>
            <Link
              to="/learn/how-to-trade"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-success hover:underline"
            >
              How deposits and withdrawals work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="lg:justify-self-end">
            <PaymentBadges showLabel />
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Withdrawals require identity verification — it keeps the market fair and your money
              safe.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
