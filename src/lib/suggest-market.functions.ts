import { createServerFn } from "@tanstack/react-start";
import type { ResearchArticle } from "./server/market-research";

interface SuggestInput {
  topic: string;
  articles: Array<{
    id?: string;
    title: string;
    source: string;
    published_at: string;
    sentiment: number | null;
    entities?: string[];
  }>;
}

const TOOL = {
  name: "propose_market",
  description:
    "Design ONE quant-grade prediction market from a clustered news brief. " +
    "Outcomes must be objectively resolvable from public sources by the deadline.",
  parameters: {
    type: "object",
    properties: {
      market_question: {
        type: "string",
        description:
          "Single-sentence YES/NO (or short multi-choice) question. Must reference a concrete event with a measurable outcome and a deadline. No opinion words.",
      },
      outcomes: {
        type: "array",
        items: { type: "string" },
        description: "Either ['YES','NO'] or 2-5 mutually exclusive labels.",
      },
      resolution_criteria: {
        type: "string",
        description:
          "Plain-English rule used to settle. Must name a verifiable source (official statement, regulator filing, scoreboard, election commission, exchange close, etc.) and the exact condition for YES.",
      },
      deadline: {
        type: "string",
        description: "ISO 8601 timestamp. Must be in the future and within 1 year.",
      },
      category: {
        type: "string",
        enum: ["politics", "sports", "entertainment", "economics"],
      },
      event_type: {
        type: "string",
        enum: [
          "earnings", "regulation", "macro", "geopolitics", "product",
          "legal", "election", "sports_fixture", "other",
        ],
      },
      key_entities: {
        type: "array",
        items: { type: "string" },
        description: "People, orgs, assets, or teams the market depends on.",
      },
      reasoning: {
        type: "string",
        description: "2-3 concise sentences: thesis, why mispricing is likely, biggest risk.",
      },
    },
    required: [
      "market_question", "outcomes", "resolution_criteria", "deadline",
      "category", "event_type", "key_entities", "reasoning",
    ],
  },
};

const SYSTEM_PROMPT =
  "You are a quantitative research agent generating prediction markets for the SokoResult platform (Kenya-focused). " +
  "Think like a trader, not a journalist. Requirements: " +
  "(1) outcomes must be binary or short multi-choice, mutually exclusive, and OBJECTIVELY resolvable from a public source you name in resolution_criteria; " +
  "(2) deadline must be specific, future, and within 1 year; " +
  "(3) reject opinion / popularity / vibe questions — never use words like 'popular', 'best', 'should', 'might be good'; " +
  "(4) prefer asymmetric, non-obvious markets where the news evidence implies an edge over a naive 50/50 prior. " +
  "Do NOT estimate the probability yourself — the platform computes the prior deterministically from sentiment and confidence. Focus on a sharp question and a watertight resolution rule.";

export interface QuantSuggestion {
  market_question: string;
  outcomes: string[];
  resolution_criteria: string;
  deadline: string;
  initial_probability: number;
  edge_score: number;
  confidence: number;
  category: string;
  event_type: string;
  key_entities: string[];
  horizon: "short" | "medium" | "long";
  reasoning: string;
  cluster_key: string;
  source_article_ids: string[];
  // Back-compat fields used by older UI:
  question: string;
  yes_price: number;
  close_at: string | null;
}

export const suggestMarket = createServerFn({ method: "POST" })
  .inputValidator((d: SuggestInput) => d)
  .handler(async ({ data }): Promise<{ suggestions: QuantSuggestion[]; rejected: number }> => {
    const { callLlmTool } = await import("./server/llm");
    const {
      clusterArticles,
      edgeScore,
      pickHorizonLabel,
      priorFromSentiment,
      resolvabilityCheck,
    } = await import("./server/market-research");
    const research: ResearchArticle[] = data.articles
      .slice(0, 40)
      .map((a, i) => ({
        id: a.id ?? `idx-${i}`,
        title: a.title,
        source: a.source,
        published_at: a.published_at,
        sentiment: a.sentiment,
        entities: a.entities ?? [],
      }));

    if (research.length === 0) return { suggestions: [], rejected: 0 };

    const clusters = clusterArticles(research)
      // largest, freshest clusters first
      .sort((a, b) => b.articles.length * (1 + b.novelty) - a.articles.length * (1 + a.novelty))
      .slice(0, 3);

    const suggestions: QuantSuggestion[] = [];
    let rejected = 0;

    for (const cluster of clusters) {
      const articleList = cluster.articles
        .slice(0, 12)
        .map((a, i) => `[${i + 1}] (${a.source}, sentiment=${a.sentiment ?? "n/a"}) ${a.title}`)
        .join("\n");

      try {
        const args = await callLlmTool<{
          market_question: string;
          outcomes: string[];
          resolution_criteria: string;
          deadline: string;
          category: string;
          event_type: string;
          key_entities: string[];
          reasoning: string;
        }>({
          system: SYSTEM_PROMPT,
          user:
            `TOPIC: ${data.topic}\n` +
            `CLUSTER ENTITIES: ${cluster.dominantEntities.join(", ") || "(none)"}\n` +
            `AVG SENTIMENT: ${cluster.avgSentiment.toFixed(3)} (dispersion ${cluster.sentimentDispersion.toFixed(3)})\n` +
            `CONFIDENCE: ${cluster.confidence.toFixed(2)} | NOVELTY: ${cluster.novelty.toFixed(2)}\n` +
            `SUGGESTED HORIZON: ~${Math.round(cluster.horizonHours)}h\n\n` +
            `RECENT NEWS:\n${articleList}`,
          tool: TOOL,
        });

        const reason = resolvabilityCheck(args.market_question, args.resolution_criteria, args.deadline);
        if (reason) {
          rejected += 1;
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

        suggestions.push({
          market_question: String(args.market_question),
          outcomes: Array.isArray(args.outcomes) ? args.outcomes.map(String) : ["YES", "NO"],
          resolution_criteria: String(args.resolution_criteria),
          deadline: String(args.deadline),
          initial_probability: prior,
          edge_score: edge,
          confidence: cluster.confidence,
          category: String(args.category),
          event_type: String(args.event_type),
          key_entities: Array.isArray(args.key_entities) ? args.key_entities.map(String) : cluster.dominantEntities,
          horizon: pickHorizonLabel(cluster.horizonHours),
          reasoning: String(args.reasoning),
          cluster_key: cluster.key,
          source_article_ids: cluster.articles.map((a) => a.id),
          // Back-compat for any caller still reading these:
          question: String(args.market_question),
          yes_price: prior,
          close_at: String(args.deadline),
        });
      } catch (e) {
        rejected += 1;
        console.error("[suggestMarket] cluster failed", cluster.key, e);
      }
    }

    suggestions.sort((a, b) => b.edge_score - a.edge_score);
    return { suggestions, rejected };
  });
