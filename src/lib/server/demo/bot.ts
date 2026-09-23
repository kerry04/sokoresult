/**
 * Demo market-maker — every ~8s of activity a random bot trader takes a
 * position in a random market, so prices drift, the tape ticks and the
 * leaderboard moves while you watch. Zero cron infra; driven lazily off
 * API requests.
 */
import { dbGet, dbPut } from "./store";
import { executeLmsrTrade } from "./lmsr";

const TICK_MS = 8_000;
let lastTick = 0;

export function maybeBotTick(force = false) {
  const now = Date.now();
  if (!force && now - lastTick < TICK_MS) return;
  lastTick = now;

  try {
    const bots = dbGet("profiles").filter((p: any) => p.display_name?.includes("."));
    const markets = dbGet("markets").filter((m: any) => m.status === "open");
    if (!bots.length || !markets.length) return;

    // Weight toward busier markets so the board's hottest rows keep moving
    const m = markets[Math.floor(Math.random() * Math.min(markets.length, 10))];
    const bot = bots[Math.floor(Math.random() * bots.length)];

    let outcomeId: string | null = null;
    let outcome: string | undefined;
    if (m.market_type === "multi") {
      const outs = dbGet("market_outcomes").filter((o: any) => o.market_id === m.id);
      outcomeId = outs[Math.floor(Math.random() * outs.length)].id;
    } else {
      // Slight mean reversion: buy the side that is currently cheaper more often
      outcome = Math.random() < 1 - Number(m.yes_price) ? "YES" : "NO";
    }

    executeLmsrTrade(
      { get: dbGet, put: dbPut },
      {
        marketId: m.id,
        outcome,
        outcomeId,
        side: Math.random() < 0.82 ? "BUY" : "SELL",
        quantity: 2 + Math.floor(Math.random() * 25),
        userId: bot.id,
        enforceBalance: false,
      },
    );

    // Occasionally float a fresh headline into the tape
    if (Math.random() < 0.08) {
      const news = dbGet("raw_news_data");
      const sources = ["Citizen Digital", "The Standard", "Pulse Kenya", "Nairobi News", "Business Daily"];
      const templates = [
        `Sources: developments on "${m.question.slice(0, 48)}…" being closely watched by analysts`,
        `Analysts split on: ${m.question.slice(0, 64)}`,
        `Social media buzz surges around: ${m.question.slice(0, 56)}…`,
      ];
      news.unshift({
        id: crypto.randomUUID(),
        title: templates[Math.floor(Math.random() * templates.length)],
        body: "Developing story — the SokoResult desk is monitoring reactions from key stakeholders.",
        source: sources[Math.floor(Math.random() * sources.length)],
        url: "#",
        image_url: null,
        category: m.category,
        published_at: new Date().toISOString(),
        processed: true,
        sentiment_score: Math.round((Math.random() * 2 - 1) * 100) / 100,
        topics: m.keywords ?? [],
        relevant_keywords: m.keywords ?? [],
        entities: null,
        analyze_attempts: 1,
        last_error: null,
        created_at: new Date().toISOString(),
      });
      dbPut("raw_news_data", news.slice(0, 200));
    }
  } catch (e) {
    console.error("[demo-bot] tick failed", e);
  }
}

import * as crypto from "node:crypto";
