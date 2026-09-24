import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/server/api-auth";
import { MAX_DEPOSIT_KES, MIN_DEPOSIT_KES, paystackStatus } from "@/lib/server/payments";

/**
 * GET /api/payments/status
 * Public capability probe: is the real-money rail configured, and in which
 * mode? Returns no secrets. Withdrawals stay disabled until the Paystack
 * Transfers payout rail is verified for Kenya.
 */
export const Route = createFileRoute("/api/payments/status")({
  server: {
    handlers: {
      GET: async () => {
        const { configured, testMode } = paystackStatus();
        return json({
          ok: true,
          configured,
          testMode,
          minDepositKes: MIN_DEPOSIT_KES,
          maxDepositKes: MAX_DEPOSIT_KES,
          depositsEnabled: configured,
          withdrawalsEnabled: false,
          kycRequired: true,
        });
      },
    },
  },
});
