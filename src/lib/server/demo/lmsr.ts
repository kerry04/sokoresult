/**
 * Demo-mode LMSR engine — a faithful TypeScript port of the Postgres
 * trade functions (execute_lmsr_trade_binary/multi, simulate_lmsr_trade, etc).
 *
 * LMSR (logarithmic market scoring rule):
 *   C(q)  = b · ln( Σ e^(q_i / b) )            — cost function
 *   p_i   = e^(q_i / b) / Σ e^(q_j / b)        — implied probability of outcome i
 *   trade cost = C(q + Δ) − C(q)
 *
 * Everything here operates on plain JSON rows from the demo store.
 */

export interface MarketLike {
  id: string;
  question: string;
  category: string;
  market_type: string; // "binary" | "multi"
  status: string;
  q_yes: number;
  q_no: number;
  liquidity_b: number;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
  [k: string]: unknown;
}

export interface OutcomeLike {
  id: string;
  market_id: string;
  label: string;
  price: number;
  q: number;
  sort_order: number;
  [k: string]: unknown;
}

const FEE_BPS = 300; // 3% fee on buys

function expSafe(x: number): number {
  if (x > 700) return Number.MAX_VALUE / 2;
  if (x < -700) return Number.MIN_VALUE;
  return Math.exp(x);
}

/** C(q) = b · ln(Σ e^(q_i/b)) with the max term factored out for stability. */
export function lmsrCost(b: number, q: number[]): number {
  const qs = q.map((v) => v / b);
  const m = Math.max(...qs);
  const sum = qs.reduce((acc, v) => acc + expSafe(v - m), 0);
  return b * (m + Math.log(sum));
}

/** Implied price for outcome i given the share vector. */
export function lmsrPrices(b: number, q: number[]): number[] {
  const qs = q.map((v) => v / b);
  const m = Math.max(...qs);
  const exps = qs.map((v) => expSafe(v - m));
  const sum = exps.reduce((a, v) => a + v, 0);
  return exps.map((e) => e / sum);
}

/** Cost of buying delta shares of outcome i. */
export function lmsrTradeCost(b: number, q: number[], i: number, delta: number): number {
  const q2 = q.slice();
  q2[i] = Math.max(0, q2[i] + delta);
  return lmsrCost(b, q2) - lmsrCost(b, q);
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TradeResult {
  ok: boolean;
  error?: string;
  cost_cents?: number; // positive amount charged (BUY) or credited (SELL)
  avg_price?: number;
  price_before?: number;
  price_after?: number;
  balance_cents?: number;
  shares?: number;
  slippage_bps?: number;
}

/**
 * Execute an LMSR trade against the store. Handles binary + multi markets,
 * balance checks, position updates, price history, and the trades ledger.
 * Returns the same shape the Postgres RPCs returned.
 */
export function executeLmsrTrade(
  db: {
    get: (t: string) => any[];
    put: (t: string, rows: any[]) => void;
  },
  opts: {
    marketId: string;
    outcome?: string; // YES | NO (binary)
    outcomeId?: string | null; // multi
    side: "BUY" | "SELL";
    quantity: number;
    userId: string;
    enforceBalance?: boolean; // false for bot trades
  },
): TradeResult {
  const markets = db.get("markets");
  const market = markets.find((m) => m.id === opts.marketId);
  if (!market) return { ok: false, error: "Market not found" };
  if (market.status !== "open") return { ok: false, error: "This market is closed" };

  const profiles = db.get("profiles");
  const profile = profiles.find((p) => p.id === opts.userId);
  if (!profile) return { ok: false, error: "Profile not found" };

  const isMulti = market.market_type === "multi";
  const outcomes = isMulti
    ? (db.get("market_outcomes") as OutcomeLike[])
        .filter((o) => o.market_id === market.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  // Build the share vector + resolve the traded index
  let q: number[];
  let index: number;
  let outcomeLabel: string;
  let outcomeId: string | null = null;
  let posOutcome: string;

  if (isMulti) {
    if (!opts.outcomeId) return { ok: false, error: "Outcome required for multi-market" };
    index = outcomes.findIndex((o) => o.id === opts.outcomeId);
    if (index < 0) return { ok: false, error: "Outcome not found" };
    q = outcomes.map((o) => Number(o.q) || 0);
    outcomeLabel = outcomes[index].label;
    outcomeId = outcomes[index].id;
    posOutcome = "CANDIDATE";
  } else {
    const side = (opts.outcome ?? "YES").toUpperCase();
    if (side !== "YES" && side !== "NO") return { ok: false, error: "Invalid outcome" };
    index = side === "YES" ? 0 : 1;
    q = [Number(market.q_yes) || 0, Number(market.q_no) || 0];
    outcomeLabel = side;
    posOutcome = side;
  }

  const b = Number(market.liquidity_b) || 750;
  const qty = Math.floor(Number(opts.quantity));
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: "Pick at least 1 share" };
  if (qty > 100_000) return { ok: false, error: "Trade size too large" };

  const pricesBefore = lmsrPrices(b, q);
  const delta = opts.side === "BUY" ? qty : -qty;

  if (opts.side === "SELL" && q[index] - qty < 0) {
    return { ok: false, error: "Not enough shares in the pool to sell that many" };
  }

  const rawCost = lmsrTradeCost(b, q, index, delta); // BUY: +, SELL: −
  const costCents = opts.side === "BUY" ? Math.ceil(rawCost * (1 + FEE_BPS / 10_000)) : Math.floor(rawCost);
  const priceBefore = pricesBefore[index];
  const avgPrice = Math.abs(rawCost) / qty / 100; // KSh per share (price is 0..1 ≈ KSh 0..100)

  if (opts.side === "BUY") {
    if (opts.enforceBalance !== false && profile.kes_balance < costCents) {
      return { ok: false, error: "Not enough balance" };
    }
  } else {
    // Can only sell shares you actually hold
    const positions = db.get("positions");
    const pos = positions.find(
      (p) =>
        p.user_id === opts.userId &&
        p.market_id === market.id &&
        (isMulti ? p.outcome_id === outcomeId : p.outcome === posOutcome) &&
        Number(p.shares) >= qty,
    );
    if (!pos) return { ok: false, error: "You don't hold that many shares" };
  }

  // Apply the trade
  q[index] = Math.max(0, q[index] + delta);
  const pricesAfter = lmsrPrices(b, q);

  if (isMulti) {
    const nextOutcomes = outcomes.map((o, i) => ({
      ...o,
      q: q[i],
      price: pricesAfter[i],
    }));
    db.put("market_outcomes", db.get("market_outcomes").map((o: any) => {
      const upd = nextOutcomes.find((n) => n.id === o.id);
      return upd ?? o;
    }));
  } else {
    market.q_yes = q[0];
    market.q_no = q[1];
    market.yes_price = pricesAfter[0];
    market.no_price = pricesAfter[1];
  }

  // Balance + ledger
  const balanceBefore = profile.kes_balance;
  profile.kes_balance =
    opts.side === "BUY" ? profile.kes_balance - costCents : profile.kes_balance + costCents;
  db.put("profiles", profiles);

  const now = new Date().toISOString();
  const tradeId = crypto.randomUUID();
  const trades = db.get("trades");
  trades.push({
    id: tradeId,
    user_id: opts.userId,
    market_id: market.id,
    order_id: null,
    outcome: posOutcome,
    outcome_id: outcomeId,
    side: opts.side,
    quantity: qty,
    price: Math.round(avgPrice * 10_000) / 10_000,
    cost_cents: costCents,
    created_at: now,
  });
  db.put("trades", trades);

  // Position upsert with weighted average price
  const positions = db.get("positions");
  const posIdx = positions.findIndex(
    (p) =>
      p.user_id === opts.userId &&
      p.market_id === market.id &&
      (isMulti ? p.outcome_id === outcomeId : p.outcome === posOutcome),
  );
  if (posIdx >= 0) {
    const p = positions[posIdx];
    if (opts.side === "BUY") {
      const totalShares = Number(p.shares) + qty;
      p.avg_price =
        (Number(p.avg_price) * Number(p.shares) + avgPrice * qty) / totalShares;
      p.shares = totalShares;
    } else {
      p.shares = Number(p.shares) - qty;
    }
    p.updated_at = now;
  } else if (opts.side === "BUY") {
    positions.push({
      id: crypto.randomUUID(),
      user_id: opts.userId,
      market_id: market.id,
      outcome: posOutcome,
      outcome_id: outcomeId,
      shares: qty,
      avg_price: avgPrice,
      updated_at: now,
    });
  }
  db.put("positions", positions);

  const txns = db.get("transactions");
  txns.push({
    id: crypto.randomUUID(),
    user_id: opts.userId,
    type: opts.side === "BUY" ? "trade_buy" : "trade_sell",
    amount_cents: opts.side === "BUY" ? -costCents : costCents,
    description: `${opts.side} ${qty} ${outcomeLabel} — ${market.question.slice(0, 60)}`,
    created_at: now,
  });
  db.put("transactions", txns);

  // Market aggregates
  if (!isMulti) db.put("markets", markets);
  const marketsNow = db.get("markets");
  const mRow = marketsNow.find((m: any) => m.id === market.id)!;
  mRow.volume_cents = (Number(mRow.volume_cents) || 0) + costCents;
  const tradedHere = trades.some(
    (t: any) => t.market_id === market.id && t.user_id === opts.userId && t.id !== tradeId,
  );
  if (!tradedHere) mRow.trader_count = (Number(mRow.trader_count) || 0) + 1;
  db.put("markets", marketsNow);

  // Price history tick
  const hist = db.get("price_history");
  const lastId = hist.reduce((a: number, r: any) => Math.max(a, Number(r.id) || 0), 0);
  hist.push({
    id: lastId + 1,
    market_id: market.id,
    yes_price: isMulti ? pricesAfter[outcomes.findIndex((o) => o.id === outcomeId)] : pricesAfter[0],
    recorded_at: now,
  });
  db.put("price_history", hist);

  return {
    ok: true,
    cost_cents: costCents,
    avg_price: Math.round(avgPrice * 10_000) / 10_000,
    price_before: Math.round(priceBefore * 10_000) / 10_000,
    price_after: Math.round(pricesAfter[index] * 10_000) / 10_000,
    balance_cents: profile.kes_balance,
    shares: qty,
  };
}

/** simulate_lmsr_trade — same math, no mutation. */
export function simulateLmsrTrade(
  markets: any[],
  outcomesAll: any[],
  opts: { marketId: string; outcome?: string; outcomeId?: string | null; side: string; quantity: number },
): TradeResult {
  const market = markets.find((m) => m.id === opts.marketId);
  if (!market) return { ok: false, error: "Market not found" };
  const isMulti = market.market_type === "multi";
  let q: number[];
  let index: number;
  if (isMulti) {
    const outcomes = outcomesAll
      .filter((o) => o.market_id === market.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    index = outcomes.findIndex((o) => o.id === opts.outcomeId);
    if (index < 0) return { ok: false, error: "Outcome not found" };
    q = outcomes.map((o) => Number(o.q) || 0);
  } else {
    const side = (opts.outcome ?? "YES").toUpperCase();
    index = side === "YES" ? 0 : 1;
    q = [Number(market.q_yes) || 0, Number(market.q_no) || 0];
  }
  const b = Number(market.liquidity_b) || 750;
  const qty = Math.floor(Number(opts.quantity) || 0);
  if (qty < 1) return { ok: false, error: "Pick at least 1 share" };
  const pricesBefore = lmsrPrices(b, q);
  const side = opts.side === "SELL" ? "SELL" : "BUY";
  const rawCost = lmsrTradeCost(b, q, index, side === "BUY" ? qty : -qty);
  const costCents = side === "BUY" ? Math.ceil(rawCost * (1 + FEE_BPS / 10_000)) : Math.floor(rawCost);
  const avgPrice = Math.abs(rawCost) / qty / 100;
  const q2 = q.slice();
  q2[index] = Math.max(0, q2[index] + (side === "BUY" ? qty : -qty));
  const after = lmsrPrices(b, q2)[index];
  return {
    ok: true,
    cost_cents: side === "SELL" ? -costCents : costCents,
    avg_price: Math.round(avgPrice * 10_000) / 10_000,
    price_before: Math.round(pricesBefore[index] * 10_000) / 10_000,
    price_after: Math.round(after * 10_000) / 10_000,
    slippage_bps: Math.round(((after - pricesBefore[index]) / Math.max(pricesBefore[index], 0.001)) * 10_000),
  };
}
