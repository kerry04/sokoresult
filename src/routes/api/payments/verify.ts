import { createFileRoute } from "@tanstack/react-router";
import { json, requireApiUser } from "@/lib/server/api-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTransaction } from "@/lib/server/payments";

/**
 * POST /api/payments/verify
 * Client polling fallback for a deposit: re-checks the transaction with
 * Paystack (server-side source of truth) and credits the wallet exactly once.
 */
export const Route = createFileRoute("/api/payments/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const { user } = authed;

        const body = (await request.json().catch(() => null)) as { reference?: unknown } | null;
        const reference = String(body?.reference ?? "").trim();
        if (!reference) return json({ ok: false, error: "Missing reference." }, 400);

        const { data: row, error: rowErr } = await supabaseAdmin
          .from("payment_references" as any)
          .select("reference, user_id, amount_cents, currency, status")
          .eq("reference", reference)
          .maybeSingle();
        if (rowErr) {
          if ((rowErr as { code?: string }).code === "42P01") {
            return json(
              { ok: false, error: "Payments database is not ready yet." },
              503,
            );
          }
          return json({ ok: false, error: "Could not look up the deposit." }, 500);
        }
        if (!row || (row as unknown as { user_id: string }).user_id !== user.id) {
          return json({ ok: false, error: "Deposit not found." }, 404);
        }
        const rec = row as unknown as {
          reference: string;
          user_id: string;
          amount_cents: number;
          currency: string;
          status: string;
        };
        if (rec.status === "credited") {
          return json({ ok: true, credited: true, already: true, status: "success" });
        }

        let verified;
        try {
          verified = await verifyTransaction(reference);
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 502);
        }

        if (verified.status !== "success") {
          if (verified.status === "failed" || verified.status === "abandoned") {
            await supabaseAdmin
              .from("payment_references" as any)
              .update({ status: "failed" })
              .eq("reference", reference);
          }
          return json({ ok: true, credited: false, status: verified.status });
        }
        if (verified.currency !== "KES" || verified.amountKes * 100 !== Number(rec.amount_cents)) {
          return json(
            { ok: false, error: "Amount mismatch — the deposit was not credited. Contact support." },
            409,
          );
        }

        const { data: credit, error: creditErr } = await (supabaseAdmin.rpc as any)(
          "credit_paystack_deposit",
          {
            _user_id: user.id,
            _reference: reference,
            _amount_cents: Number(rec.amount_cents),
          },
        );
        if (creditErr) {
          if ((creditErr as { code?: string }).code === "42883") {
            return json(
              { ok: false, error: "Payments database is not ready yet." },
              503,
            );
          }
          return json({ ok: false, error: "Could not credit the deposit. Contact support." }, 500);
        }
        return json({
          ok: true,
          credited: true,
          already: Boolean((credit as { already?: boolean })?.already),
          status: "success",
          amountKes: verified.amountKes,
        });
      },
    },
  },
});
