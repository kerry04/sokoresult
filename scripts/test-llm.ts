// Five integration tests for the OpenRouter/Ling LLM gateway.
// Run: node --experimental-strip-types --env-file=.env scripts/test-llm.ts
// Requires OPENROUTER_API_KEY in .env. All five must pass.

import { callLlmTool, isLlmDegraded } from "../src/lib/server/llm.ts";

const EXTRACT_TOOL = {
  name: "extract_signal",
  description: "Extract structured signal data from a text",
  parameters: {
    type: "object",
    properties: {
      keywords: { type: "array", items: { type: "string" } },
      topic: { type: "string", enum: ["crypto", "politics", "tech", "finance", "sports", "geopolitics", "health", "other"] },
      market_relevant: { type: "boolean" },
      signal_strength: { type: "string", enum: ["weak", "moderate", "strong", "very strong"] },
      summary: { type: "string" },
    },
    required: ["keywords", "topic", "market_relevant", "signal_strength", "summary"],
  },
};

const EXTRACT_SYSTEM =
  "You extract structured market-signal data from text. Identify keywords, categorize the topic, " +
  "assess market relevance and signal strength, and write a one-line summary.";

const SENTIMENT_TOOL = {
  name: "score_sentiment",
  description: "Score financial/market sentiment of a text",
  parameters: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["bullish", "bearish", "neutral", "uncertain"] },
      intensity: { type: "number" },
      confidence: { type: "number" },
      sarcasm_detected: { type: "boolean" },
      sarcasm_confidence: { type: "number" },
      pump_phrases: { type: "array", items: { type: "string" } },
      fud_phrases: { type: "array", items: { type: "string" } },
      market_impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
      reasoning: { type: "string" },
    },
    required: ["direction", "intensity", "confidence", "sarcasm_detected", "market_impact", "reasoning"],
  },
};

const SENTIMENT_SYSTEM =
  "You are a financial sentiment analyst for a prediction-market platform. Detect sarcasm, pump/FUD " +
  "language, and negation. Score direction, intensity (0-1), your own confidence (0-1), and market impact.";

const SUGGEST_TOOL = {
  name: "propose_market",
  description: "Propose a new prediction market from a topic cluster",
  parameters: {
    type: "object",
    properties: {
      market_question: { type: "string" },
      resolution_criteria: { type: "string" },
      category: { type: "string", enum: ["crypto", "politics", "tech", "finance", "sports", "geopolitics", "health", "other"] },
      keyword_tags: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      reasoning: { type: "string" },
    },
    required: ["market_question", "resolution_criteria", "category", "keyword_tags", "confidence", "reasoning"],
  },
};

const SUGGEST_SYSTEM =
  "You propose new prediction markets from trending topic clusters. Titles must be unambiguous yes/no " +
  "questions. Resolution criteria must be airtight — no reasonable disagreement about the outcome.";

const TRADE_TOOL = {
  name: "assess_trade",
  description: "Qualitative assessment of a rule-flagged trade",
  parameters: {
    type: "object",
    properties: {
      actually_suspicious: { type: "boolean" },
      risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
      insider_trading_suspected: { type: "boolean" },
      escalation: { type: "string", enum: ["LOG", "ADMIN_REVIEW", "ACCOUNT_FREEZE", "ESCALATE_TO_LAW_ENFORCEMENT"] },
      reasoning: { type: "string" },
    },
    required: ["actually_suspicious", "risk_level", "insider_trading_suspected", "escalation", "reasoning"],
  },
};

const TRADE_SYSTEM =
  "You assess suspicious-trade flags for a prediction market. Rule-based systems flagged the trade; " +
  "you judge context, intent, and narrative. Recommend an escalation level.";

function check(name: string, cond: boolean, detail: unknown) {
  const pass = cond ? "PASS" : "FAIL";
  console.log(`[${pass}] ${name}${cond ? "" : " — " + JSON.stringify(detail).slice(0, 300)}`);
  return cond;
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("OPENROUTER_API_KEY not set. Add it to .env first.");
    process.exit(2);
  }

  let failures = 0;

  // TEST 1 — identity / EXTRACT
  try {
    const r = await callLlmTool<Record<string, unknown>>({
      system: EXTRACT_SYSTEM,
      user: 'I am Ling 3.0 Flash VL. "Bitcoin ETF sees record $1.2B inflows as institutions pile in ahead of the halving."',
      tool: EXTRACT_TOOL,
      timeoutMs: 60_000,
    });
    const ok =
      check("T1 keywords", Array.isArray(r.keywords) && (r.keywords as unknown[]).length >= 3, r.keywords) &&
      check("T1 topic=crypto", r.topic === "crypto", r.topic) &&
      check("T1 market_relevant", r.market_relevant === true, r.market_relevant);
    if (!ok) failures++;
  } catch (e) { console.log("[FAIL] T1 threw:", (e as Error).message.slice(0, 200)); failures++; }

  // TEST 2 — clear bullish signal
  try {
    const r = await callLlmTool<Record<string, unknown>>({
      system: SENTIMENT_SYSTEM,
      user: "The Federal Reserve announced a larger-than-expected rate cut, citing cooling inflation. Equity futures jumped 2% immediately on the statement.",
      tool: SENTIMENT_TOOL,
      timeoutMs: 60_000,
    });
    const ok =
      check("T2 bullish", r.direction === "bullish", r.direction) &&
      check("T2 impact high/critical", r.market_impact === "high" || r.market_impact === "critical", r.market_impact) &&
      check("T2 not sarcastic", r.sarcasm_detected === false, r.sarcasm_detected);
    if (!ok) failures++;
  } catch (e) { console.log("[FAIL] T2 threw:", (e as Error).message.slice(0, 200)); failures++; }

  // TEST 3 — sarcasm (hardest)
  try {
    const r = await callLlmTool<Record<string, unknown>>({
      system: SENTIMENT_SYSTEM,
      user: 'sure the fed is definitely NOT cutting rates lol this is going to crash bigly',
      tool: SENTIMENT_TOOL,
      timeoutMs: 60_000,
    });
    const ok =
      check("T3 sarcasm detected", r.sarcasm_detected === true, r.sarcasm_detected) &&
      check("T3 sarcasm_confidence>0.6", Number(r.sarcasm_confidence) > 0.6, r.sarcasm_confidence);
    if (!ok) failures++;
  } catch (e) { console.log("[FAIL] T3 threw:", (e as Error).message.slice(0, 200)); failures++; }

  // TEST 4 — market suggestion
  try {
    const r = await callLlmTool<Record<string, unknown>>({
      system: SUGGEST_SYSTEM,
      user:
        "TOPIC CLUSTER: 'AI regulation in the US'\n" +
        "KEYWORDS: AI Act, Senate, OpenAI, frontier models, safety standards\n" +
        "SIGNALS: 47 articles in 6h, velocity accelerating, sentiment mixed-lean-restrictive\n" +
        "SOURCES: Reuters, WSJ, The Information, TechCrunch",
      tool: SUGGEST_TOOL,
      timeoutMs: 60_000,
    });
    const q = String(r.market_question ?? "");
    const ok =
      check("T4 yes/no question", /^(will|does|is|are|has|do)\b/i.test(q) && /\?/.test(q), q) &&
      check("T4 criteria length", String(r.resolution_criteria ?? "").length > 40, r.resolution_criteria) &&
      check("T4 tags", Array.isArray(r.keyword_tags) && (r.keyword_tags as unknown[]).length >= 2, r.keyword_tags);
    if (!ok) failures++;
  } catch (e) { console.log("[FAIL] T4 threw:", (e as Error).message.slice(0, 200)); failures++; }

  // TEST 5 — insider-trade flag
  try {
    const r = await callLlmTool<Record<string, unknown>>({
      system: TRADE_SYSTEM,
      user:
        "FLAGGED TRADE: user bought 50,000 YES shares on 'Will the Fed cut rates in September?' 15 minutes " +
        "before the official Fed announcement of a rate cut. Account is 9 days old, first large position. " +
        "Rule flags triggered: unusual_amount, rapid_trading, new_account_activity.",
      tool: TRADE_TOOL,
      timeoutMs: 60_000,
    });
    const ok =
      check("T5 suspicious", r.actually_suspicious === true, r.actually_suspicious) &&
      check("T5 insider suspected", r.insider_trading_suspected === true, r.insider_trading_suspected) &&
      check("T5 escalation >= ADMIN_REVIEW", ["ADMIN_REVIEW", "ACCOUNT_FREEZE", "ESCALATE_TO_LAW_ENFORCEMENT"].includes(String(r.escalation)), r.escalation);
    if (!ok) failures++;
  } catch (e) { console.log("[FAIL] T5 threw:", (e as Error).message.slice(0, 200)); failures++; }

  console.log(`\ndegraded mode active: ${isLlmDegraded()}`);
  console.log(failures === 0 ? "\n✅ ALL 5 TESTS PASSED" : `\n❌ ${failures} test(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
