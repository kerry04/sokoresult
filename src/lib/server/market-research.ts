/**
 * Quant-research helpers for the AI market suggester.
 *
 * Pure functions, no DB / no env. Used by both the manual server-fn
 * (`suggest-market.functions.ts`) and the cron route
 * (`api/public/hooks/auto-suggest-markets.ts`) so the maths is identical
 * in both flows.
 */

export interface ResearchArticle {
  id: string;
  title: string;
  source: string;
  published_at: string;
  sentiment: number | null;
  entities?: string[];
}

export interface ArticleCluster {
  key: string;                  // stable cluster fingerprint
  articles: ResearchArticle[];
  avgSentiment: number;         // mean of available sentiment scores in [-1,1]
  sentimentDispersion: number;  // stdev of sentiments (0 if <2 samples)
  confidence: number;           // 0..1, blends source diversity + sample size
  novelty: number;              // 0..1, fraction of articles <12h old
  dominantEntities: string[];   // top entities by frequency
  horizonHours: number;         // suggested horizon, derived from recency
}

const STOPWORDS = new Set([
  "the","a","an","and","or","of","in","on","for","to","is","are","was","were",
  "be","by","with","from","as","at","it","its","this","that","these","those",
  "kenya","kenyan","ke","says","say","said","new","after","before","over",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Greedy single-link clustering on title-token Jaccard similarity.
 * Threshold 0.35 picks up "Ruto signs new finance bill" / "Finance bill 2025
 * signed by Ruto" without merging unrelated stories.
 */
export function clusterArticles(
  articles: ResearchArticle[],
  threshold = 0.35,
): ArticleCluster[] {
  const tokenized = articles.map((a) => ({ a, toks: tokens(a.title) }));
  const groups: Array<typeof tokenized> = [];

  for (const item of tokenized) {
    let placed = false;
    for (const g of groups) {
      // compare against the centroid (first member)
      if (jaccard(item.toks, g[0].toks) >= threshold) {
        g.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([item]);
  }

  return groups.map((g) => buildCluster(g.map((x) => x.a)));
}

function buildCluster(arts: ResearchArticle[]): ArticleCluster {
  const sentiments = arts
    .map((a) => a.sentiment)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));

  const avgSentiment =
    sentiments.length > 0
      ? sentiments.reduce((s, x) => s + x, 0) / sentiments.length
      : 0;

  const dispersion = stdev(sentiments);

  const sources = new Set(arts.map((a) => a.source));
  // Confidence: more sources + more articles → higher, capped at 1.
  const confidence = clamp(
    0.25 + 0.15 * sources.size + 0.05 * arts.length + 0.2 * (sentiments.length > 0 ? 1 : 0),
    0,
    1,
  );

  const now = Date.now();
  const fresh = arts.filter(
    (a) => now - new Date(a.published_at).getTime() < 12 * 3600_000,
  ).length;
  const novelty = arts.length > 0 ? fresh / arts.length : 0;

  // Entity tally (case-insensitive). Take top 5.
  const tally = new Map<string, number>();
  for (const a of arts) {
    for (const e of a.entities ?? []) {
      const k = e.trim();
      if (!k) continue;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
  }
  const dominantEntities = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  // Median article age → suggest horizon (more recent stories = shorter window).
  const ages = arts
    .map((a) => (now - new Date(a.published_at).getTime()) / 3600_000)
    .sort((a, b) => a - b);
  const medianAge = ages[Math.floor(ages.length / 2)] ?? 24;
  const horizonHours = clamp(medianAge < 6 ? 72 : medianAge < 24 ? 168 : 336, 24, 720);

  // Cluster key: top 3 tokens (alphabetical) — stable across runs for de-dup.
  const merged = new Set<string>();
  for (const a of arts) for (const t of tokens(a.title)) merged.add(t);
  const key = [...merged].sort().slice(0, 3).join("-") || "cluster";

  return {
    key,
    articles: arts,
    avgSentiment,
    sentimentDispersion: dispersion,
    confidence,
    novelty,
    dominantEntities,
    horizonHours,
  };
}

/**
 * Bayesian-flavoured prior derived from sentiment + confidence.
 *
 *   L      = exp(alpha * s)
 *   P_sent = L / (1 + L)             // logistic squashing
 *   w_unc  = clamp(1 - confidence, 0.1, 0.6)
 *   w_sent = (1 - w_unc) * (base != null ? 0.5 : 1.0)
 *   w_base = (1 - w_unc) * (base != null ? 0.5 : 0.0)
 *   P0     = w_base*base + w_sent*P_sent + w_unc*0.5
 *
 * Result is clamped to [0.05, 0.95] so every market is tradable on both sides.
 */
export function priorFromSentiment(
  s: number,
  confidence: number,
  base?: number,
  alpha = 1.5,
): number {
  const sBounded = clamp(s, -1, 1);
  const c = clamp(confidence, 0, 1);
  const L = Math.exp(alpha * sBounded);
  const pSent = L / (1 + L);

  const wUnc = clamp(1 - c, 0.1, 0.6);
  const hasBase = typeof base === "number" && Number.isFinite(base);
  const wSent = (1 - wUnc) * (hasBase ? 0.5 : 1.0);
  const wBase = (1 - wUnc) * (hasBase ? 0.5 : 0.0);

  const p0 = wBase * (base ?? 0.5) + wSent * pSent + wUnc * 0.5;
  return clamp(p0, 0.05, 0.95);
}

/**
 * Edge potential 0..1.
 *  - strong, confident sentiment dominates
 *  - novelty rewards fresh stories the market hasn't priced in
 *  - dispersion proxies expected volatility (more disagreement = more vol)
 *  - horizon bonus peaks for windows in [24h, 7d] — long enough to trade,
 *    short enough to avoid drift / decay
 */
export function edgeScore(input: {
  avgSentiment: number;
  confidence: number;
  novelty: number;
  dispersion: number;
  horizonHours: number;
}): number {
  const sStrength = Math.abs(clamp(input.avgSentiment, -1, 1));
  const c = clamp(input.confidence, 0, 1);
  const novelty = clamp(input.novelty, 0, 1);
  // Sentiment stdev is bounded by 1; rescale for emphasis.
  const dispersion = clamp(input.dispersion / 0.6, 0, 1);

  // Tent function on ln(hours): peak at ~96h, falls off either side.
  const h = clamp(input.horizonHours, 1, 720);
  const ln = Math.log(h);
  const peak = Math.log(96);
  const horizonBonus = clamp(1 - Math.abs(ln - peak) / Math.log(720), 0, 1);

  const raw =
    0.45 * sStrength * c +
    0.25 * novelty +
    0.2 * dispersion +
    0.1 * horizonBonus;

  return clamp(raw, 0, 1);
}

/**
 * Hard resolvability gate. Returns null if usable, otherwise a reason string.
 * Caller should drop the suggestion when this returns non-null.
 */
export function resolvabilityCheck(
  question: string,
  criteria: string | null | undefined,
  deadline: string | null | undefined,
): string | null {
  if (!question || question.trim().length < 10) return "question too short";
  if (!criteria || criteria.trim().length < 15) return "missing resolution criteria";

  if (!deadline) return "missing deadline";
  const ts = new Date(deadline).getTime();
  if (!Number.isFinite(ts)) return "invalid deadline";
  if (ts <= Date.now() + 3600_000) return "deadline too soon (<1h)";
  if (ts > Date.now() + 365 * 86400_000) return "deadline too far (>1y)";

  const lower = `${question} ${criteria}`.toLowerCase();
  const opinionMarkers = [
    "popular", "should", "might be good", "best ever", "worst ever",
    "favorite", "favourite", "people will love", "people will hate",
  ];
  for (const m of opinionMarkers) {
    if (lower.includes(m)) return `opinion phrasing: "${m}"`;
  }

  const unboundedMarkers = ["someday", "ever ", " ever?", "eventually"];
  for (const m of unboundedMarkers) {
    if (lower.includes(m)) return `unbounded phrasing: "${m.trim()}"`;
  }

  return null;
}

export function pickHorizonLabel(hours: number): "short" | "medium" | "long" {
  if (hours <= 72) return "short";
  if (hours <= 24 * 14) return "medium";
  return "long";
}
