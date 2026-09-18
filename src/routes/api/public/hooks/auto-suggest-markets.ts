import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { callGeminiTool } from "@/lib/server/gemini";
import {
  clusterArticles,
  edgeScore,
  pickHorizonLabel,
  priorFromSentiment,
  resolvabilityCheck,
  type ResearchArticle,
} from "@/lib/server/market-research";

const TOOL = {
  name: "propose_market",
  description: "Design ONE quant-grade prediction market from a clustered news brief.",
  parameters: {
    type: "object",
    properties: {
      market_question: { type: "string" },
      outcomes: { type: "array", items: { type: "string" } },
      resolution_criteria: { type: "string" },
      deadline: { type: "string" },
      category: { type: "string", enum: ["politics", "sports", "entertainment", "economics"] },
      event_type: {
        type: "string",
        enum: ["earnings","regulation","macro","geopolitics","product","legal","election","sports_fixture","other"],
      },
      key_entities: { type: "array", items: { type: "string" } },
      reasoning: { type: "string" },
    },
    required: ["market_question","outcomes","resolution_criteria","deadline","category","event_type","key_entities","reasoning"],
  },
};

const SYSTEM_PROMPT =
  "You are a quantitative research agent generating prediction markets for SokoResult (Kenya-focused). " +
  "Outcomes must be objectively resolvable from a public source you cite in resolution_criteria. " +
  "Deadline must be future and within 1 year. Reject opinion / popularity questions. " +
  "Do NOT estimate probability — the platform computes it from sentiment.";

export const Route = createFileRoute("/api/public/hooks/auto-suggest-markets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!process.env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ ok: false, error: "GEMINI_API_KEY missing" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: minEdgeRow } = await admin
          .from("system_settings")
          .select("value")
          .eq("key", "quant_min_edge_score")
          .maybeSingle();
        const minEdge = Number((minEdgeRow?.value as any) ?? 0.25);

        const { data: trends, error: tErr } = await admin
          .from("trending_keywords")
          .select("*")
          .gte("trend_score", 0.3)
          .gte("mentions_1h", 3)
          .order("trend_score", { ascending: false })
          .limit(8);
        if (tErr) {
          return new Response(JSON.stringify({ ok: false, error: tErr.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        if (!trends || trends.length === 0) {
          return new Response(JSON.stringify({ ok: true, suggested: 0, reason: "no qualifying trends" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Skip clusters already covered by a recent suggestion (cluster_key match in last 24h).
        const sinceISO = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { data: existing } = await admin
          .from("market_suggestions")
          .select("topic, cluster_key, created_at")
          .gte("created_at", sinceISO);
        const recentTopics = new Set((existing ?? []).map((s) => s.topic.toLowerCase()));
        const recentClusters = new Set((existing ?? []).map((s) => s.cluster_key).filter(Boolean));

        const results: Array<{ topic: string; ok: boolean; cluster?: string; edge?: number; reason?: string }> = [];
        let suggested = 0;

        for (const t of trends) {
          if (recentTopics.has(t.keyword.toLowerCase())) {
            results.push({ topic: t.keyword, ok: false, reason: "duplicate topic (24h)" });
            continue;
          }

          const ids = (t.sample_article_ids ?? []).slice(0, 12);
          const { data: arts } = ids.length
            ? await admin
                .from("raw_news_data")
                .select("id, title, source, published_at, sentiment_score, entities")
                .in("id", ids)
            : { data: [] as any[] };

          const research: ResearchArticle[] = (arts ?? []).map((a: any) => ({
            id: a.id,
            title: a.title,
            source: a.source,
            published_at: a.published_at,
            sentiment: a.sentiment_score,
            entities: Array.isArray(a.entities) ? a.entities.map(String) : [],
          }));
          if (research.length === 0) {
            results.push({ topic: t.keyword, ok: false, reason: "no articles" });
            continue;
          }

          // Pick the strongest cluster per trending keyword.
          const clusters = clusterArticles(research)
            .sort((a, b) => b.articles.length - a.articles.length);
          const cluster = clusters[0];
          if (!cluster) {
            results.push({ topic: t.keyword, ok: false, reason: "no cluster" });
            continue;
          }
          if (recentClusters.has(cluster.key)) {
            results.push({ topic: t.keyword, ok: false, cluster: cluster.key, reason: "duplicate cluster (24h)" });
            continue;
          }

          const articleList = cluster.articles
            .slice(0, 10)
            .map((a, i) => `[${i + 1}] (${a.source}, sentiment=${a.sentiment ?? "n/a"}) ${a.title}`)
            .join("\n");

          try {
            const args = await callGeminiTool<{
              market_question: string; outcomes: string[]; resolution_criteria: string;
              deadline: string; category: string; event_type: string;
              key_entities: string[]; reasoning: string;
            }>({
              system: SYSTEM_PROMPT,
              user:
                `TRENDING TOPIC: ${t.keyword}\n` +
                `Mentions(1h): ${t.mentions_1h} (prev ${t.mentions_prev_1h}), growth ${t.growth}, trend ${t.trend_score}\n` +
                `Cluster: ${cluster.dominantEntities.join(", ")} | avg_sentiment=${cluster.avgSentiment.toFixed(3)} dispersion=${cluster.sentimentDispersion.toFixed(3)}\n` +
                `Confidence ${cluster.confidence.toFixed(2)} | Novelty ${cluster.novelty.toFixed(2)} | Horizon ~${Math.round(cluster.horizonHours)}h\n\n` +
                `RECENT NEWS:\n${articleList}`,
              tool: TOOL,
            });

            const reason = resolvabilityCheck(args.market_question, args.resolution_criteria, args.deadline);
            if (reason) {
              results.push({ topic: t.keyword, ok: false, cluster: cluster.key, reason });
              continue;
            }

            const prior = priorFromSentiment(cluster.avgSentiment, cluster.confidence);
            const edge = edgeScore({
              avgSentiment: cluster.avgSentiment,
              confidence: cluster.confidence,
              novelty: cluster.novelty,
              dispersion: cluster.sentimentDispersion,
              horizonHours: cluster.horizonHours,
            });

            if (edge < minEdge) {
              results.push({ topic: t.keyword, ok: false, cluster: cluster.key, edge, reason: "edge below threshold" });
              continue;
            }

            const { error: insErr } = await admin.from("market_suggestions").insert({
              topic: t.keyword,
              suggested_question: String(args.market_question),
              suggested_yes_price: prior,
              suggested_category: String(args.category),
              suggested_close_at: String(args.deadline),
              ai_reasoning: String(args.reasoning),
              source_article_ids: cluster.articles.map((a) => a.id),
              initial_probability: prior,
              edge_score: edge,
              horizon: pickHorizonLabel(cluster.horizonHours),
              event_type: String(args.event_type),
              key_entities: Array.isArray(args.key_entities) ? args.key_entities.map(String) : cluster.dominantEntities,
              cluster_key: cluster.key,
              resolution_criteria: String(args.resolution_criteria),
              confidence: cluster.confidence,
              auto_generated: true,
              status: "pending",
              trend_score: Number(t.trend_score),
              news_count: cluster.articles.length,
            });
            if (insErr) {
              results.push({ topic: t.keyword, ok: false, cluster: cluster.key, reason: insErr.message });
            } else {
              suggested += 1;
              recentClusters.add(cluster.key);
              results.push({ topic: t.keyword, ok: true, cluster: cluster.key, edge });
            }
          } catch (e) {
            results.push({
              topic: t.keyword, ok: false, cluster: cluster?.key,
              reason: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return new Response(JSON.stringify({ ok: true, suggested, minEdge, results }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
