import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json } from "@/lib/server/api-auth";
import { verifyTransaction, verifyWebhookSignature } from "@/lib/server/payments";

/**
 * POST /api/payments/webhook
 * Paystack event receiver. No auth header — authenticity comes from the
 * HMAC-SHA512 signature over the RAW request bytes. Responds 200 fast; the
 * transaction is re-verified server-side before any credit, and credits are
 * idempotent per reference.
 */
export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = Buffer.from(await request.arrayBuffer());
        const signature = request.headers.get("x-paystack-signature");
        if (!verifyWebhookSignature(raw, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const body = JSON.parse(raw.toString("utf8")) as {
          event?: string;
          data?: { reference?: string; metadata?: Record<string, unknown> };
        };
        if (body.event !== "charge.success") {
          return json({ ok: true, ignored: body.event ?? "unknown" });
        }
        const reference = body.data?.reference;
        if (!reference) return json({ ok: true, ignored: "no-reference" });

        let verified;
        try {
          verified = await verifyTransaction(reference);
        } catch (e) {
          // Transient failure (network/Paystack down): return 500 so Paystack
          // retries the webhook later. The client poll covers the user anyway.
          console.error("[paystack-webhook] verify failed", reference, e);
          return new Response("verify-failed", { status: 500 });
        }
        if (verified.status !== "success" || verified.currency !== "KES") {
          return json({ ok: true, ignored: verified.status });
        }

        const userId =
          verified.userId ??
          (typeof body.data?.metadata?.user_id === "string"
            ? (body.data.metadata.user_id as string)
            : null);
        if (!userId) {
          console.error("[paystack-webhook] no user for reference", reference);
          return json({ ok: true, ignored: "no-user" });
        }

        const { error: creditErr } = await (supabaseAdmin.rpc as any)("credit_paystack_deposit", {
          _user_id: userId,
          _reference: reference,
          _amount_cents: verified.amountKes * 100,
        });
        if (creditErr) {
          // 42883 = RPC missing (migration not applied). Log and ack so
          // Paystack stops retrying; the client poll will surface it too.
          console.error("[paystack-webhook] credit failed", reference, creditErr);
        }
        return json({ ok: true, credited: !creditErr });
      },
    },
  },
});
