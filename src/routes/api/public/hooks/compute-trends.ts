import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { sanitizeKeyword } from "@/lib/server/keywords";
import { logPipelineFailure } from "@/lib/server/pipeline-alerts";

interface ArticleRow {
  id: string;
  relevant_keywords: string[] | null;
  entities: Array<{ name: string; type: string }> | null;
  sentiment_score: number | null;
  category: string | null;
  published_at: string;
}

interface Agg {
  mentions_24h: number;
  mentions_6h: number;
  mentions_prev_6_24h: number;
  articles_24h: Set<string>;
  sent_sum: number;
  sent_n: number;
  categories: Record<string, number>;
  came_from_entity: boolean;
}

export const Route = createFileRoute("/api/public/hooks/compute-trends")({
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

        const now = Date.now();
        const sixHoursAgo = new Date(now - 6 * 3600_000).toISOString();
        const twentyFourHoursAgo = new Date(now - 24 * 3600_000).toISOString();

        const { data: rows, error } = await admin
          .from("raw_news_data")
          .select("id, relevant_keywords, entities, sentiment_score, category, published_at")
          .eq("processed", true)
          .gte("published_at", twentyFourHoursAgo)
          .order("published_at", { ascending: false })
          .limit(3000);

        if (error) {
          await logPipelineFailure(admin, "compute-trends:fetch_articles", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const articles = (rows ?? []) as ArticleRow[];
        const map = new Map<string, Agg>();

        for (const r of articles) {
          const inLast6h = r.published_at >= sixHoursAgo;

          const entityList = r.entities ?? [];
          const entityNames = new Set(
            entityList.map((e) => (e?.name ?? "").toLowerCase().trim()).filter(Boolean),
          );
          const ctx = { entityNames };

          const candidates = new Map<string, boolean>();
          for (const k of r.relevant_keywords ?? []) {
            const clean = sanitizeKeyword(k, ctx);
            if (!clean) continue;
            if (!candidates.has(clean)) candidates.set(clean, false);
          }
          for (const e of entityList) {
            const clean = sanitizeKeyword(e?.name, ctx);
            if (!clean) continue;
            candidates.set(clean, true);
          }

          for (const [kw, fromEntity] of candidates) {
            const cur = map.get(kw) ?? {
              mentions_24h: 0,
              mentions_6h: 0,
              mentions_prev_6_24h: 0,
              articles_24h: new Set<string>(),
              sent_sum: 0,
              sent_n: 0,
              categories: {},
              came_from_entity: false,
            };
            cur.mentions_24h += 1;
            cur.articles_24h.add(r.id);
            if (inLast6h) cur.mentions_6h += 1;
            else cur.mentions_prev_6_24h += 1;
            if (typeof r.sentiment_score === "number") {
              cur.sent_sum += r.sentiment_score;
              cur.sent_n += 1;
            }
            if (r.category) cur.categories[r.category] = (cur.categories[r.category] ?? 0) + 1;
            if (fromEntity) cur.came_from_entity = true;
            map.set(kw, cur);
          }
        }

        // Phrase merge: drop single-word keywords subsumed by multi-word phrases
        const keys = Array.from(map.keys());
        const phrases = keys.filter((k) => k.includes(" "));
        const singles = keys.filter((k) => !k.includes(" "));
        for (const single of singles) {
          const singleAgg = map.get(single);
          if (!singleAgg) continue;
          let bestPhrase: string | null = null;
          let bestOverlap = 0;
          for (const phrase of phrases) {
            const phraseWords = phrase.split(" ");
            if (!phraseWords.includes(single)) continue;
            const phraseAgg = map.get(phrase);
            if (!phraseAgg) continue;
            let overlap = 0;
            for (const id of phraseAgg.articles_24h) {
              if (singleAgg.articles_24h.has(id)) overlap++;
            }
            const minSize = Math.min(phraseAgg.articles_24h.size, singleAgg.articles_24h.size);
            if (minSize > 0 && overlap / minSize >= 0.5 && overlap > bestOverlap) {
              bestOverlap = overlap;
              bestPhrase = phrase;
            }
          }
          if (bestPhrase) map.delete(single);
        }

        const upserts = Array.from(map.entries())
          .map(([keyword, a]) => {
            const articlesNow = a.articles_24h.size;
            const growth =
              (a.mentions_6h - a.mentions_prev_6_24h) / (a.mentions_prev_6_24h + 1);
            const avgSent = a.sent_n > 0 ? a.sent_sum / a.sent_n : 0;

            // News-only score
            const entityBonus = a.came_from_entity ? 0.15 : 0;
            const growthBonus = a.mentions_6h > a.mentions_prev_6_24h ? 0.10 : 0;
            const trendScore =
              0.55 * Math.log(a.mentions_24h + 1) +
              0.25 * Math.log(articlesNow + 1) +
              0.15 * Math.abs(avgSent) +
              entityBonus +
              growthBonus;

            const velocity = a.mentions_6h / 6;

            // 4-bucket lifecycle, retuned for news-only volume
            let lifecycle: "emerging" | "rising" | "peaking" | "declining" = "emerging";
            if (growth < -0.2 && a.mentions_prev_6_24h >= 3) lifecycle = "declining";
            else if (trendScore >= 1.4 && a.mentions_6h >= 3) lifecycle = "peaking";
            else if (trendScore >= 0.8 && growth > 0) lifecycle = "rising";
            else lifecycle = "emerging";

            const topCat =
              Object.entries(a.categories).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
            return {
              keyword,
              mentions_1h: a.mentions_6h, // legacy column name = current 6h window
              mentions_prev_1h: a.mentions_prev_6_24h,
              growth: Number(growth.toFixed(4)),
              avg_sentiment: Number(avgSent.toFixed(4)),
              velocity: Number(velocity.toFixed(4)),
              lifecycle,
              confidence: Math.min(1, articlesNow / 8),
              trend_score: Number(trendScore.toFixed(4)),
              social_mentions_6h: 0,
              category: topCat,
              sample_article_ids: Array.from(a.articles_24h).slice(0, 8),
              updated_at: new Date().toISOString(),
              _articlesNow: articlesNow,
            };
          })
          // Floor: keep keywords with at least 1 article in the 24h window.
          // Tunable; raise to 2+ once volume stabilises.
          .filter((u) => u._articlesNow >= 1)
          .map(({ _articlesNow, ...rest }) => rest)
          .sort((a, b) => b.trend_score - a.trend_score)
          .slice(0, 100);

        // Wipe and replace
        const { error: delErr } = await admin
          .from("trending_keywords")
          .delete()
          .neq("keyword", "__never__");
        if (delErr) console.error("Trend cleanup failed", delErr.message);

        if (upserts.length > 0) {
          const { error: upErr } = await admin
            .from("trending_keywords")
            .upsert(upserts, { onConflict: "keyword" });
          if (upErr) {
            await logPipelineFailure(admin, "compute-trends:upsert_keywords", upErr);
            return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(
          JSON.stringify(
            {
              ok: true,
              articlesScanned: articles.length,
              keywordsTracked: upserts.length,
              top: upserts.slice(0, 10).map((u) => ({
                keyword: u.keyword,
                mentions: u.mentions_1h + u.mentions_prev_1h,
                trend_score: u.trend_score,
                lifecycle: u.lifecycle,
              })),
            },
            null,
            2,
          ),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
