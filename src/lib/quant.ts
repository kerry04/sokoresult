/**
 * Quant trading math — pure TypeScript port of the Python `sokoquant` library.
 * No external dependencies. All probability operations done in logit space for
 * numerical stability near 0 and 1.
 */

const EPS = 1e-9;

const clampProb = (p: number): number => Math.min(1 - EPS, Math.max(EPS, p));

export const logit = (p: number): number => {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
};

export const sigmoid = (x: number): number => {
  // Stable sigmoid
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
};

/** L = exp(α · s) */
export const computeLikelihood = (s: number, alpha: number): number =>
  Math.exp(alpha * s);

/**
 * Bayesian posterior given likelihood ratio L = P(E|H) / P(E|¬H).
 * Done in logit space: logit(p_new) = logit(p_market) + ln(L).
 */
export const bayesianUpdate = (pMarket: number, L: number): number => {
  const lnL = Math.log(Math.max(L, EPS));
  return sigmoid(logit(pMarket) + lnL);
};

/** Apply Bayesian update directly from a sentiment score with scale α. */
export const updateFromSentiment = (
  pMarket: number,
  s: number,
  alpha: number,
): number => sigmoid(logit(pMarket) + alpha * s);

export const computeEdge = (pNew: number, pMarket: number): number =>
  pNew - pMarket;

/** s_eff = s · exp(-λ · Δt) */
export const applyTimeDecay = (
  s: number,
  lambda: number,
  dt: number,
): number => s * Math.exp(-lambda * Math.max(0, dt));

/**
 * Fractional Kelly bet size in units of bankroll.
 * For a binary bet at price `p` paying 1 if correct:
 *   full Kelly fraction f* = edge / (1 - p)   when betting YES (edge > 0)
 *                          = -edge / p        when betting NO  (edge < 0)
 * We then scale by `kellyFraction` and cap at `maxPct` of bankroll.
 */
export const kellyBet = (
  edge: number,
  pMarket: number,
  bankroll: number,
  kellyFraction = 0.25,
  maxPct = 0.05,
): number => {
  if (bankroll <= 0 || pMarket <= 0 || pMarket >= 1) return 0;
  const denom = edge >= 0 ? 1 - pMarket : pMarket;
  if (denom <= EPS) return 0;
  const fStar = Math.abs(edge) / denom;
  const sized = bankroll * kellyFraction * fStar;
  const capped = Math.min(sized, bankroll * maxPct);
  return Math.max(0, capped);
};

export type TradeAction = "BUY_YES" | "BUY_NO" | "HOLD";

export interface DecisionInput {
  pMarket: number;
  pModel: number;
  bankroll: number;
  threshold?: number;
  kellyFraction?: number;
  maxPct?: number;
  confidence?: number;
  minConfidence?: number;
}

export interface Decision {
  pMarket: number;
  pModel: number;
  edge: number;
  betSize: number;
  action: TradeAction;
  reason: string;
}

export const decide = ({
  pMarket,
  pModel,
  bankroll,
  threshold = 0.03,
  kellyFraction = 0.25,
  maxPct = 0.05,
  confidence = 1,
  minConfidence = 0,
}: DecisionInput): Decision => {
  const edge = computeEdge(pModel, pMarket);
  if (confidence < minConfidence) {
    return {
      pMarket,
      pModel,
      edge,
      betSize: 0,
      action: "HOLD",
      reason: `confidence ${confidence.toFixed(2)} < min ${minConfidence}`,
    };
  }
  if (Math.abs(edge) < threshold) {
    return {
      pMarket,
      pModel,
      edge,
      betSize: 0,
      action: "HOLD",
      reason: `|edge| ${Math.abs(edge).toFixed(4)} < threshold ${threshold}`,
    };
  }
  const betSize = kellyBet(edge, pMarket, bankroll, kellyFraction, maxPct);
  return {
    pMarket,
    pModel,
    edge,
    betSize,
    action: edge > 0 ? "BUY_YES" : "BUY_NO",
    reason: "edge above threshold",
  };
};

// --- LMSR (numerically stable, mirrors the SQL implementation) ---

const maxShift = (q: number[], b: number): number => {
  let m = -Infinity;
  for (const v of q) {
    const r = v / b;
    if (r > m) m = r;
  }
  return m;
};

export const lmsrCost = (q: number[], b: number): number => {
  if (b <= 0) throw new Error("b must be > 0");
  if (q.length === 0) return 0;
  const m = maxShift(q, b);
  let sum = 0;
  for (const v of q) sum += Math.exp(v / b - m);
  return b * (m + Math.log(sum));
};

export const lmsrPrice = (q: number[], b: number, i: number): number => {
  if (b <= 0) throw new Error("b must be > 0");
  if (i < 0 || i >= q.length) throw new Error("index out of range");
  const m = maxShift(q, b);
  let sum = 0;
  for (const v of q) sum += Math.exp(v / b - m);
  return Math.exp(q[i] / b - m) / sum;
};

export const simulateTrade = (
  q: number[],
  b: number,
  i: number,
  delta: number,
): {
  cost: number;
  priceBefore: number;
  priceAfter: number;
  slippageBps: number;
} => {
  const priceBefore = lmsrPrice(q, b, i);
  const c0 = lmsrCost(q, b);
  const qNext = q.slice();
  qNext[i] += delta;
  const c1 = lmsrCost(qNext, b);
  const cost = c1 - c0;
  const priceAfter = lmsrPrice(qNext, b, i);
  const avg = delta !== 0 ? Math.abs(cost / delta) : priceBefore;
  const slippageBps =
    priceBefore > 0 ? ((avg - priceBefore) / priceBefore) * 10000 : 0;
  return { cost, priceBefore, priceAfter, slippageBps };
};

export const executeTrade = (
  q: number[],
  b: number,
  i: number,
  delta: number,
): { qAfter: number[]; cost: number } => {
  const c0 = lmsrCost(q, b);
  const qAfter = q.slice();
  qAfter[i] += delta;
  const c1 = lmsrCost(qAfter, b);
  return { qAfter, cost: c1 - c0 };
};
