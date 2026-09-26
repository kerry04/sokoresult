import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { callLlmTool } from "@/lib/server/llm";
import { sanitizeKeywords } from "@/lib/server/keywords";
import { logPipelineFailure } from "@/lib/server/pipeline-alerts";

// Batch tool: scores multiple articles in a single LLM call.
// Drastically reduces request count to stay under rate limits.
const BATCH_TOOL = {
  name: "score_articles",
  description:
    "Extract structured signals (sentiment, named entities, specific keywords, category) " +
    "for each article in the input list. Return one result per article, in the same order.",
  parameters: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "Scored results, one per input article, in the same order as the input.",
        items: {
          type: "object",
          properties: {
            index: {
              type: "integer",
              description: "Zero-based index matching the input article position.",
            },
            sentiment: {
              type: "number",
              description: "Sentiment from -1 (very negative) to 1 (very positive).",
            },
            entities: {
              type: "array",
              description:
                "Named entities mentioned in the article. ONLY proper nouns " +
                "(people, organisations, places, events, products, teams). " +
                "Names exactly as written in the article (preserve capitalisation).",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: {
                    type: "string",
                    enum: ["PERSON", "ORG", "PLACE", "EVENT", "PRODUCT", "TEAM"],
                  },
                },
                required: ["name", "type"],
              },
            },
            keywords: {
              type: "array",
              description:
                "3 to 8 lowercase tags. Each MUST be either: a multi-word entity " +
                "(e.g. 'william ruto', 'kcb bank', 'harambee stars'), a specific " +
                "event or policy name (e.g. 'finance bill 2024', 'afcon 2025'), or " +
                "a domain-specific noun (e.g. 'shilling', 'mpesa', 'unga'). " +
                "STRICTLY FORBIDDEN: generic words like news, sports, politics, " +
                "business, economy, kenya, africa, government, people, leader, " +
                "story, deal, win, loss, plan, move, push, threat, hope, public, " +
                "national, international, breaking, viral, trending, official.",
              items: { type: "string" },
            },
            category: {
              type: "string",
              enum: ["politics", "sports", "entertainment", "fashion", "economics"],
            },
            market_potential: {
              type: "number",
              description:
                "0 to 1: how much this article could drive a binary prediction market. " +
                "1 = clear upcoming event with measurable outcome (election, match, policy vote). " +
                "0 = pure opinion piece or evergreen feature with no resolvable outcome.",
            },
          },
          required: ["index", "sentiment", "entities", "keywords", "category", "market_potential"],
        },
      },
    },
    required: ["results"],
  },
};

interface ScoredItem {
  index: number;
  sentiment: number;
  entities: Array<{ name: string; type: string }>;
  keywords: string[];
  category: string;
  market_potential: number;
}

const SYSTEM_PROMPT =
  "You analyze Kenyan and African news for the SokoResult prediction market platform. " +
  "Your job is to extract SPECIFIC, NAMED signals — proper nouns, named events, and " +
  "domain-specific terms. NEVER return generic news vocabulary. " +
  "\n\nGOOD keywords: 'william ruto', 'kcb bank', 'harambee stars', 'finance bill', " +
  "'afcon 2025', 'mulamwah', 'shilling', 'mpesa', 'azimio coalition', 'al ahly'. " +
  "\nBAD keywords (NEVER emit these): 'news', 'sports', 'business', 'politics', 'economy', " +
  "'kenya', 'africa', 'government', 'people', 'leader', 'story', 'deal', 'win', 'loss', " +
  "'plan', 'push', 'threat', 'hope', 'public', 'breaking', 'official', 'statement'. " +
  "\n\nCall the score_articles tool with one entry per input article, preserving the " +
  "input order via the 'index' field.";

function buildBatchUser(batch: Array<{ title: string; body: string | null }>): string {
  return batch
    .map(
      (a, i) =>
        `--- ARTICLE ${i} ---\nTITLE: ${a.title}\nBODY: ${(a.body ?? "(no body)").slice(0, 1500)}`,
    )
    .join("\n\n");
}

async function scoreBatchOnce(
  batch: Array<{ title: string; body: string | null }>,
): Promise<Map<number, ScoredItem>> {
  const out = await callLlmTool<{ results: ScoredItem[] }>({
    system: SYSTEM_PROMPT,
    user: buildBatchUser(batch).slice(0, 20000),
    tool: BATCH_TOOL,
    timeoutMs: 45_000,
  });
  const map = new Map<number, ScoredItem>();
  for (const r of out.results ?? []) {
    if (typeof r.index === "number") map.set(r.index, r);
  }
  return map;
}

// One retry on 429 / rate limit so a single throttle doesn't burn an attempt.
async function scoreBatch(
  batch: Array<{ title: string; body: string | null }>,
): Promise<Map<number, ScoredItem>> {
  try {
    return await scoreBatchOnce(batch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rate limit|429/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 8000));
      return await scoreBatchOnce(batch);
    }
    throw e;
  }
}

const BATCH_SIZE = 15;
const MAX_PER_RUN = 120;

export const Route = createFileRoute("/api/public/hooks/analyze-sentiment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: rows, error: fetchErr } = await admin
          .from("raw_news_data")
          .select("id, title, body, category, analyze_attempts")
          .eq("processed", false)
          .lt("analyze_attempts", 3)
          .order("analyze_attempts", { ascending: true })
          .order("published_at", { ascending: false })
          .limit(MAX_PER_RUN);

        if (fetchErr) {
          await logPipelineFailure(admin, "analyze-sentiment:fetch_pending", fetchErr);
          return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const articles = rows ?? [];
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        // Split into batches of BATCH_SIZE
        for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          const batch = articles.slice(i, i + BATCH_SIZE);
          let scored: Map<number, ScoredItem>;
          try {
            scored = await scoreBatch(
              batch.map((a) => ({ title: a.title, body: a.body })),
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Whole batch failed — bump attempts on each, leave processed=false
            for (const row of batch) {
              await admin
                .from("raw_news_data")
                .update({
                  analyze_attempts: (row.analyze_attempts ?? 0) + 1,
                  last_error: msg.slice(0, 500),
                })
                .eq("id", row.id);
              results.push({ id: row.id, ok: false, error: msg });
            }
            continue;
          }

          // Apply per-article results
          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const item = scored.get(j);
            if (!item) {
              // Model dropped this article — retry next tick
              await admin
                .from("raw_news_data")
                .update({
                  analyze_attempts: (row.analyze_attempts ?? 0) + 1,
                  last_error: "Missing from batch response",
                })
                .eq("id", row.id);
              results.push({ id: row.id, ok: false, error: "missing from batch" });
              continue;
            }

            const entities = (item.entities ?? []).filter(
              (e) => e && typeof e.name === "string" && e.name.trim().length > 0,
            );
            const entityNames = new Set(entities.map((e) => e.name.toLowerCase().trim()));

            // Sanitise: keywords from model + multi-word entity names as keywords
            const cleanedKeywords = sanitizeKeywords(
              [
                ...(item.keywords ?? []),
                ...entities.map((e) => e.name),
              ],
              { entityNames },
            );

            const update: Record<string, unknown> = {
              sentiment_score: item.sentiment,
              entities,
              topics: [],
              relevant_keywords: cleanedKeywords,
              processed: true,
              last_error: null,
              analyze_attempts: (row.analyze_attempts ?? 0) + 1,
            };
            // Guard: some models ignore the schema enum and invent categories
            // ("technology", "education", ...). Never let that fail the write —
            // leave category unset rather than burning the article's attempt.
            const VALID_CATEGORIES = ["politics", "sports", "entertainment", "fashion", "economics"];
            if (!row.category && typeof item.category === "string" && VALID_CATEGORIES.includes(item.category)) {
              update.category = item.category;
            }

            const { error: upErr } = await admin
              .from("raw_news_data")
              .update(update)
              .eq("id", row.id);
            if (upErr) results.push({ id: row.id, ok: false, error: upErr.message });
            else results.push({ id: row.id, ok: true });
          }

          // Breather between batches: free-tier OpenRouter allows ~10 req/10s
          // and upstream free models throttle hard — 8s keeps us well clear.
          if (i + BATCH_SIZE < articles.length) {
            await new Promise((r) => setTimeout(r, 8000));
          }
        }

        return new Response(
          JSON.stringify(
            {
              ok: true,
              processed: results.length,
              succeeded: results.filter((r) => r.ok).length,
              failed: results.filter((r) => !r.ok).length,
              results,
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
