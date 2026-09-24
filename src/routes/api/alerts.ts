import { createFileRoute } from "@tanstack/react-router";
import { json, requireApiUser } from "@/lib/server/api-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function tableMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

/**
 * GET /api/alerts — the caller's active price alerts with market context.
 * POST /api/alerts — create one: { market_id, direction: 'above'|'below', threshold_pct: 1..99 }.
 *
 * Alerts are stored, not yet fired: /api/alerts/check must be scheduled
 * (pg_cron, needs approval) before notifications actually go out. The POST
 * response says so honestly.
 */
export const Route = createFileRoute("/api/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const { data, error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("price_alerts" as any)
          .select("id, market_id, direction, threshold, triggered, created_at")
          .eq("user_id", authed.user.id)
          .order("created_at", { ascending: false });
        if (error) {
          if (tableMissing(error))
            return json({ ok: false, error: "Price alerts are not available yet." }, 503);
          return json({ ok: false, error: "Could not load alerts." }, 500);
        }
        return json({ ok: true, alerts: data ?? [] });
      },
      POST: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const body = (await request.json().catch(() => null)) as {
          market_id?: unknown;
          direction?: unknown;
          threshold_pct?: unknown;
        } | null;
        const marketId = String(body?.market_id ?? "").trim();
        const direction =
          body?.direction === "above" || body?.direction === "below" ? body.direction : null;
        const pct = Number(body?.threshold_pct);
        if (!marketId || !direction || !Number.isFinite(pct) || pct <= 0 || pct >= 100) {
          return json(
            {
              ok: false,
              error: "Need market_id, direction (above/below) and threshold_pct (1–99).",
            },
            400,
          );
        }
        // Only open binary markets can carry a price alert.
        const { data: market, error: mErr } = await supabaseAdmin
          .from("markets")
          .select("id, question, status, market_type")
          .eq("id", marketId)
          .maybeSingle();
        if (mErr || !market) return json({ ok: false, error: "Market not found." }, 404);
        if (
          (market as { status: string }).status !== "open" ||
          (market as { market_type: string }).market_type !== "binary"
        ) {
          return json(
            { ok: false, error: "Alerts are only available on open binary markets." },
            400,
          );
        }
        const { data, error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("price_alerts" as any)
          .insert({
            user_id: authed.user.id,
            market_id: marketId,
            direction,
            threshold: pct / 100,
          })
          .select("id")
          .single();
        if (error) {
          if (tableMissing(error))
            return json({ ok: false, error: "Price alerts are not available yet." }, 503);
          if ((error as { code?: string }).code === "23505")
            return json({ ok: false, error: "You already have that alert." }, 409);
          return json({ ok: false, error: "Could not create the alert." }, 500);
        }
        return json({
          ok: true,
          id: (data as unknown as { id: string }).id,
          note: "Alert saved. Alerts are checked on a schedule — firing starts once the scheduler is enabled.",
        });
      },
    },
  },
});
