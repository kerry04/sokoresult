import { createFileRoute } from "@tanstack/react-router";
import { json, requireApiUser } from "@/lib/server/api-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULTS = {
  payouts: true,
  resolutions: true,
  trades: true,
  price_alerts: true,
  marketing: false,
};

const PREF_KEYS = Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>;

function tableMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

/**
 * GET /api/notifications/preferences — the caller's preference row,
 * or defaults when they never saved one.
 * PUT /api/notifications/preferences — upsert booleans for known keys.
 */
export const Route = createFileRoute("/api/notifications/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const { data, error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("notification_preferences" as any)
          .select("payouts, resolutions, trades, price_alerts, marketing")
          .eq("user_id", authed.user.id)
          .maybeSingle();
        if (error) {
          if (tableMissing(error))
            return json({ ok: false, error: "Preferences are not available yet." }, 503);
          return json({ ok: false, error: "Could not load preferences." }, 500);
        }
        const row = (data ?? {}) as unknown as Record<string, unknown>;
        return json({ ok: true, preferences: { ...DEFAULTS, ...row } });
      },
      PUT: async ({ request }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return json({ ok: false, error: "Missing body." }, 400);
        const patch: Record<string, boolean> = {};
        for (const k of PREF_KEYS) {
          if (typeof body[k] === "boolean") patch[k] = body[k] as boolean;
        }
        if (Object.keys(patch).length === 0)
          return json({ ok: false, error: "Nothing to update." }, 400);
        const { error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("notification_preferences" as any)
          .upsert({ user_id: authed.user.id, ...patch, updated_at: new Date().toISOString() });
        if (error) {
          if (tableMissing(error))
            return json({ ok: false, error: "Preferences are not available yet." }, 503);
          return json({ ok: false, error: "Could not save preferences." }, 500);
        }
        return json({ ok: true });
      },
    },
  },
});
