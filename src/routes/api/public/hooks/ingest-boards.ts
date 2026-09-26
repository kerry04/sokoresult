import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { parseAFTable } from "@/lib/server/stocks/africanfinancials";

/**
 * POST /api/public/hooks/ingest-boards
 * Daily EOD board ingest for NSE/NGX/GSE (feeds soko-stock's boards).
 * A VM cron fetches the African Financials price-list pages with curl
 * (their WAF blocks Vercel and Supabase IPs, but not the VM) and POSTs the
 * raw HTML here:
 *
 *   { "exchange": "NSE", "html": "<page html>" }
 *
 * Auth: x-cron-secret header (same CRON_SECRET as the other hooks).
 * Parses the table and upserts into public.stock_boards. Idempotent.
 */
export const Route = createFileRoute("/api/public/hooks/ingest-boards")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        let body: { exchange?: string; html?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "bad json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const { exchange, html } = body;
        if (!exchange || !html || typeof html !== "string" || html.length < 1000) {
          return new Response(JSON.stringify({ ok: false, error: "bad request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const rows = parseAFTable(html, exchange);
        if (rows.length === 0) {
          return new Response(
            JSON.stringify({ ok: false, error: "no rows parsed", exchange }),
            { status: 422, headers: { "content-type": "application/json" } },
          );
        }

        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { error } = await admin.from("stock_boards").upsert(
          rows.map((r) => ({
            exchange,
            ticker: r.ticker,
            name: r.name,
            price: r.price,
            change_percent: r.changePercent,
            volume: r.volume,
            value_traded: r.value,
            ytd_percent: r.ytdPercent,
            sector: r.sector,
            updated: r.updated,
            fetched_at: new Date().toISOString(),
          })),
          { onConflict: "exchange,ticker" },
        );
        if (error) {
          return new Response(
            JSON.stringify({ ok: false, error: "upsert failed", detail: error.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ ok: true, exchange, rows: rows.length }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
