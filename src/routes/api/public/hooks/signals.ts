import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/lib/server/cron-auth";

// Scheduled signal/risk job. Runs every ~10 min via pg_cron.
// Refreshes treasury, computes/applies market signals, scores user behaviour.
export const Route = createFileRoute("/api/public/hooks/signals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const result: Record<string, unknown> = { ok: true };

        try {
          await supabaseAdmin.rpc("refresh_treasury" as any);
          result.treasury = "refreshed";
        } catch (e) {
          result.treasury_error = (e as Error).message;
        }

        try {
          const { data, error } = await supabaseAdmin.rpc("run_signal_update_all" as any);
          if (error) throw error;
          result.signals = data;
        } catch (e) {
          result.signals_error = (e as Error).message;
        }

        try {
          const { data, error } = await supabaseAdmin.rpc("score_user_behavior" as any);
          if (error) throw error;
          result.risk = data;
        } catch (e) {
          result.risk_error = (e as Error).message;
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
