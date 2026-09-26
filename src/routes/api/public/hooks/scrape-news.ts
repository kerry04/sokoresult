import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { OUTLETS, ingestOutlet, type Article } from "@/lib/server/news/ingestors";

// Kenyan + global news ingestion — config-driven, 7 ingestor code paths, ~45 outlets.
// See src/lib/server/news/ingestors.ts.
// Cadence: fired by pg_cron on the ~20-min cycle; outlets are ingested in
// parallel (≤6 concurrent) since the work is HTTP-bound, then DB writes run
// sequentially to keep the in-run URL dedupe exact.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function recordHealth(
  admin: AnyClient,
  source: string,
  fetchStarted: string,
  success: boolean,
  error: string | null,
  insertedCount: number,
) {
  const { data: prev } = await admin
    .from("source_health")
    .select("consecutive_failures, articles_24h, last_success_at")
    .eq("source", source)
    .maybeSingle();
  const prevFails = (prev?.consecutive_failures as number | undefined) ?? 0;
  const prevArticles = (prev?.articles_24h as number | undefined) ?? 0;
  const prevSuccess = (prev?.last_success_at as string | undefined) ?? null;
  const fails = success ? 0 : prevFails + 1;
  let status: "active" | "stale" | "down" = "active";
  if (fails >= 3) status = "down";
  else if (!success) status = "stale";
  await admin.from("source_health").upsert(
    {
      source,
      last_fetch_at: fetchStarted,
      last_success_at: success ? fetchStarted : prevSuccess,
      consecutive_failures: fails,
      articles_24h: prevArticles + insertedCount,
      last_error: success ? null : error,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source" },
  );
}

function toRow(outletSource: string, a: Article, defaultCategory?: string) {
  return {
    source: outletSource,
    title: a.title.slice(0, 500),
    url: a.url,
    body: a.body?.slice(0, 4000) || null,
    image_url: a.imageUrl || null,
    published_at: a.publishedAt,
    category: defaultCategory ?? null,
    processed: false,
  };
}

const STAGGER_MS = 400;

/** Bounded-parallel map for the HTTP-bound ingest phase. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const Route = createFileRoute("/api/public/hooks/scrape-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const results: Array<{
          source: string;
          fetched: number;
          inserted: number;
          error?: string;
          skipped?: boolean;
        }> = [];

        // In-run URL dedupe (Standard's 7 sections overlap heavily): the same
        // story from the same host is stored once, credited to the first
        // outlet that saw it this cycle. Cross-run dedupe stays on source,url.
        const seenHostPath = new Set<string>();
        const seenUrl = (url: string) => {
          try {
            const u = new URL(url);
            return seenHostPath.has(u.host + u.pathname.replace(/\/$/, ""));
          } catch {
            return false;
          }
        };

        // Phase 1: ingest outlets in parallel (HTTP-bound, ≤6 concurrent).
        // Phase 2 below stays sequential: in-run URL dedupe + DB writes + health.
        const fetchStartedAt = OUTLETS.map(() => new Date().toISOString());
        const ingestResults = await mapLimit(OUTLETS, 6, (outlet) => ingestOutlet(outlet, admin));

        for (let oi = 0; oi < OUTLETS.length; oi++) {
          const outlet = OUTLETS[oi];
          const fetchStarted = fetchStartedAt[oi];
          const res = ingestResults[oi];

          if (res.skipped) {
            results.push({
              source: outlet.source,
              fetched: 0,
              inserted: 0,
              skipped: true,
              error: res.error,
            });
            continue;
          }

          if (!res.ok) {
            await recordHealth(
              admin,
              outlet.source,
              fetchStarted,
              false,
              res.error ?? "unknown error",
              0,
            );
            results.push({ source: outlet.source, fetched: 0, inserted: 0, error: res.error });
            await new Promise((r) => setTimeout(r, STAGGER_MS));
            continue;
          }

          const rows = res.articles
            .filter((a) => !seenUrl(a.url))
            .map((a) => {
              try {
                const u = new URL(a.url);
                seenHostPath.add(u.host + u.pathname.replace(/\/$/, ""));
              } catch {
                /* dedupe best-effort */
              }
              return toRow(outlet.source, a, outlet.defaultCategory);
            });

          if (rows.length === 0) {
            await recordHealth(admin, outlet.source, fetchStarted, true, null, 0);
            results.push({ source: outlet.source, fetched: res.articles.length, inserted: 0 });
            continue;
          }

          const { data, error } = await admin
            .from("raw_news_data")
            .upsert(rows, { onConflict: "source,url", ignoreDuplicates: true })
            .select("id");

          if (error) {
            await recordHealth(admin, outlet.source, fetchStarted, false, error.message, 0);
            results.push({
              source: outlet.source,
              fetched: res.articles.length,
              inserted: 0,
              error: error.message,
            });
          } else {
            const inserted = data?.length ?? 0;
            await recordHealth(admin, outlet.source, fetchStarted, true, null, inserted);
            results.push({ source: outlet.source, fetched: res.articles.length, inserted });
          }

          await new Promise((r) => setTimeout(r, STAGGER_MS));
        }

        return new Response(JSON.stringify({ ok: true, results }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
