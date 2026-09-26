import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/public/hooks/ingest-boards
 * Daily EOD board ingest for NSE/NGX/GSE (feeds soko-stock's boards).
 * A VM cron fetches the African Financials price-list pages with curl
 * (their WAF blocks Vercel and Supabase IPs, but not the VM), parses the
 * tables, and POSTs the compact rows here (large HTML payloads don't
 * survive the egress proxy, so parsing happens on the VM):
 *
 *   { "exchange": "NSE", "rows": [{ticker, name, price, change_percent,
 *     volume, value_traded, ytd_percent, sector, updated}, ...] }
 *
 * Auth: x-cron-secret header (same CRON_SECRET as the other hooks).
 * Upserts into public.stock_boards. Idempotent.
 */
interface BoardRowIn {
  ticker: string;
  name: string;
  price: number;
  change_percent?: number | null;
  volume?: number | null;
  value_traded?: number | null;
  ytd_percent?: number | null;
  sector?: string | null;
  updated?: string | null;
}

export const Route = createFileRoute("/api/public/hooks/ingest-boards")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        let body: { exchange?: string; rows?: BoardRowIn[] };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "bad json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const { exchange, rows } = body;
        if (
          !exchange ||
          !Array.isArray(rows) ||
          rows.length === 0 ||
          rows.some(
            (r) =>
              !r || typeof r.ticker !== "string" || typeof r.name !== "string" ||
              typeof r.price !== "number" || !Number.isFinite(r.price),
          )
        ) {
          return new Response(JSON.stringify({ ok: false, error: "bad request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
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
            change_percent: r.change_percent ?? null,
            volume: r.volume ?? null,
            value_traded: r.value_traded ?? null,
            ytd_percent: r.ytd_percent ?? null,
            sector: r.sector ?? null,
            updated: r.updated ?? null,
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
