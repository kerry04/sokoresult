import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/server/api-auth";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";

interface AlertRow {
  id: string;
  user_id: string;
  market_id: string;
  direction: "above" | "below";
  threshold: number;
  markets: { yes_price: number; question: string; status: string; slug: string } | Array<{ yes_price: number; question: string; status: string; slug: string }> | null;
}

/**
 * POST /api/alerts/check — cron entry point for price alerts.
 * Guarded by CRON_SECRET. NOT YET SCHEDULED: wire a pg_cron job to POST here
 * (needs separate approval) before alerts actually fire.
 *
 * For each untriggered alert: compare the market's current YES price with the
 * threshold, fire a notification when the condition holds, and mark the alert
 * triggered exactly once. Users who disabled price alerts in preferences are
 * skipped (their alert is still marked triggered so it never piles up).
 */
export const Route = createFileRoute("/api/alerts/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: alerts, error } = await admin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("price_alerts" as any)
          .select("id, user_id, market_id, direction, threshold, markets(yes_price, question, status, slug)")
          .eq("triggered", false)
          .limit(500);
        if (error) {
          if ((error as { code?: string }).code === "42P01")
            return json({ ok: false, error: "price_alerts table missing" }, 503);
          return json({ ok: false, error: "Could not load alerts." }, 500);
        }

        let fired = 0;
        let skipped = 0;
        for (const a of (alerts ?? []) as unknown as AlertRow[]) {
          const m = Array.isArray(a.markets) ? a.markets[0] : a.markets;
          if (!m || m.status !== "open") {
            skipped++;
            continue;
          }
          const price = Number(m.yes_price);
          const hit =
            a.direction === "above" ? price >= Number(a.threshold) : price <= Number(a.threshold);
          if (!hit) continue;

          // Respect the user's preference before notifying.
          const { data: prefs } = await admin
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
            .from("notification_preferences" as any)
            .select("price_alerts")
            .eq("user_id", a.user_id)
            .maybeSingle();
          const wantsAlerts = (prefs as { price_alerts?: boolean } | null)?.price_alerts !== false;

          const pct = Math.round(price * 100);
          const thr = Math.round(Number(a.threshold) * 100);
          if (wantsAlerts) {
            await admin.from("notifications").insert({
              user_id: a.user_id,
              kind: "price_alert",
              title: `Price alert: ${m.question.slice(0, 80)}`,
              body:
                a.direction === "above"
                  ? `YES is now ${pct}% — at or above your ${thr}% alert.`
                  : `YES is now ${pct}% — at or below your ${thr}% alert.`,
              link: `/markets/${m.slug}`,
            });
            fired++;
          } else {
            skipped++;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          await admin.from("price_alerts" as any).update({ triggered: true }).eq("id", a.id);
        }

        return json({ ok: true, checked: (alerts ?? []).length, fired, skipped });
      },
    },
  },
});
