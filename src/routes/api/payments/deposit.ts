import { createFileRoute } from "@tanstack/react-router";
import { json, requireApiUser } from "@/lib/server/api-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MAX_DEPOSIT_KES,
  MIN_DEPOSIT_KES,
  initializeMpesaDeposit,
  newDepositReference,
  normalizeKenyanPhone,
  paystackStatus,
} from "@/lib/server/payments";

/**
 * POST /api/payments/deposit
 * Starts a Paystack direct M-Pesa charge (STK push). Auth required, KYC tier 1+
 * required. Nothing is credited here — crediting happens only after Paystack
 * confirms success via /verify or the signature-verified webhook.
 */
export const Route = createFileRoute("/api/payments/deposit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const { user, supabase } = authed;

        const body = (await request.json().catch(() => null)) as {
          amountKes?: unknown;
          phone?: unknown;
        } | null;
        const amountKes = Math.floor(Number(body?.amountKes));
        const phone = normalizeKenyanPhone(String(body?.phone ?? ""));

        if (!Number.isFinite(amountKes) || amountKes < MIN_DEPOSIT_KES) {
          return json(
            { ok: false, error: `Minimum deposit is KSh ${MIN_DEPOSIT_KES}.` },
            400,
          );
        }
        if (amountKes > MAX_DEPOSIT_KES) {
          return json(
            { ok: false, error: `Maximum single deposit is KSh ${MAX_DEPOSIT_KES.toLocaleString()}.` },
            400,
          );
        }
        if (!phone) {
          return json({ ok: false, error: "Enter a valid Kenyan mobile number." }, 400);
        }
        if (!user.email) {
          return json(
            { ok: false, error: "Add an email address to your profile before depositing." },
            400,
          );
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("kyc_tier")
          .eq("id", user.id)
          .maybeSingle();
        if (Number((profile as { kyc_tier?: number } | null)?.kyc_tier ?? 0) < 1) {
          return json(
            { ok: false, error: "Complete verification to use real money.", kycRequired: true },
            403,
          );
        }

        const { configured, testMode } = paystackStatus();
        if (!configured) {
          return json(
            { ok: false, error: "Real-money deposits are not connected yet." },
            503,
          );
        }

        const reference = newDepositReference(user.id);

        // Record the pending deposit first — idempotency key for verify/webhook.
        const { error: recErr } = await supabaseAdmin.from("payment_references" as any).insert({
          reference,
          user_id: user.id,
          provider: "paystack",
          kind: "deposit",
          amount_cents: amountKes * 100,
          currency: "KES",
          status: "pending",
          raw: { phone },
        });
        if (recErr) {
          if ((recErr as { code?: string }).code === "42P01") {
            return json(
              {
                ok: false,
                error:
                  "Payments database is not ready yet — the pending migration has not been applied.",
              },
              503,
            );
          }
          return json({ ok: false, error: "Could not start the deposit. Try again." }, 500);
        }

        try {
          const charge = await initializeMpesaDeposit({
            email: user.email,
            amountKes,
            phone,
            reference,
            userId: user.id,
          });
          return json({
            ok: true,
            reference: charge.reference,
            status: charge.status,
            message: charge.message,
            testMode,
            hint: "Check your phone for the M-Pesa prompt and enter your PIN.",
          });
        } catch (e) {
          await supabaseAdmin
            .from("payment_references" as any)
            .update({ status: "failed", raw: { phone, error: (e as Error).message } })
            .eq("reference", reference);
          return json(
            { ok: false, error: (e as Error).message || "Paystack rejected the charge." },
            502,
          );
        }
      },
    },
  },
});
