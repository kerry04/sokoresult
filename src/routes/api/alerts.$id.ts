import { createFileRoute } from "@tanstack/react-router";
import { json, requireApiUser } from "@/lib/server/api-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function tableMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

/** DELETE /api/alerts/$id — remove one of the caller's alerts. */
export const Route = createFileRoute("/api/alerts/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const authed = await requireApiUser(request);
        if (authed instanceof Response) return authed;
        const { error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("price_alerts" as any)
          .delete()
          .eq("id", params.id)
          .eq("user_id", authed.user.id);
        if (error) {
          if (tableMissing(error))
            return json({ ok: false, error: "Price alerts are not available yet." }, 503);
          return json({ ok: false, error: "Could not delete the alert." }, 500);
        }
        return json({ ok: true });
      },
    },
  },
});
