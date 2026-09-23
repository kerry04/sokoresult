import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { callLlmTool } from "@/lib/server/llm";

const TOOL = {
  name: "recommend_resolution",
  description: "Recommend a resolution outcome for a closed prediction market based on news context.",
  parameters: {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["YES", "NO", "UNRESOLVED"] },
      confidence: { type: "number", description: "0..1 confidence in the recommendation." },
      reasoning: { type: "string" },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["outcome", "confidence", "reasoning", "sources"],
  },
};

interface Recommendation {
  outcome: "YES" | "NO" | "UNRESOLVED";
  confidence: number;
  reasoning: string;
  sources: string[];
}

async function recommend(
  question: string,
  description: string | null,
  articles: Array<{ title: string; url: string; published_at: string }>,
): Promise<Recommendation> {
  const context = articles
    .slice(0, 20)
    .map((a, i) => `[${i + 1}] ${a.title} — ${a.url} (${a.published_at})`)
    .join("\n");

  return await callLlmTool<Recommendation>({
    system:
      "You are an oracle for a prediction market. Given a YES/NO question and recent news, " +
      "recommend YES, NO, or UNRESOLVED with a calibrated confidence. Only choose YES/NO if the " +
      "evidence is clear and recent. Cite the article numbers you used.",
    user: `MARKET QUESTION: ${question}\n\nDESCRIPTION: ${description ?? "(none)"}\n\nRECENT NEWS:\n${context || "(no relevant articles found)"}`,
    tool: TOOL,
    timeoutMs: 45_000,
  });
}

export const Route = createFileRoute("/api/public/hooks/auto-resolve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Markets that have closed but are still open
        const { data: markets, error } = await admin
          .from("markets")
          .select("id, question, description, keywords, auto_resolve_enabled")
          .eq("status", "open")
          .lt("closes_at", new Date().toISOString())
          .limit(10);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<Record<string, unknown>> = [];

        for (const m of markets ?? []) {
          try {
            // Pull recent matching news
            const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
            let q = admin
              .from("raw_news_data")
              .select("title, url, published_at")
              .gte("published_at", since)
              .order("published_at", { ascending: false })
              .limit(20);
            if (m.keywords && m.keywords.length) {
              q = q.overlaps("relevant_keywords", m.keywords);
            }
            const { data: news } = await q;

            const rec = await recommend(m.question, m.description, news ?? []);

            // Cache recommendation
            await admin
              .from("markets")
              .update({ pending_resolution: { ...rec, generated_at: new Date().toISOString() } })
              .eq("id", m.id);

            // Auto-settle only if opted-in AND high confidence AND not UNRESOLVED
            if (m.auto_resolve_enabled && rec.confidence >= 0.85 && rec.outcome !== "UNRESOLVED") {
              const { error: rpcErr } = await admin.rpc("resolve_market", {
                _market_id: m.id,
                _outcome: rec.outcome === "YES",
              });
              results.push({ id: m.id, action: "auto-resolved", outcome: rec.outcome, confidence: rec.confidence, error: rpcErr?.message });
            } else {
              results.push({ id: m.id, action: "queued", outcome: rec.outcome, confidence: rec.confidence });
            }
          } catch (e) {
            results.push({ id: m.id, action: "error", error: e instanceof Error ? e.message : String(e) });
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: results.length, results }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
