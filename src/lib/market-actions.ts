/**
 * Trading wrapper — the only place UI components touch the LMSR RPC layer.
 * Components import buyShares/sellShares/previewBuy/previewSell and never see
 * "LMSR", "cost function", or share-vector terminology.
 */
import { supabase } from "@/integrations/supabase/client";

export type Outcome = "YES" | "NO" | "CANDIDATE";

export interface TradePreview {
  shares: number;
  cost_cents: number; // BUY: amount paid · SELL: amount received
  avg_price: number;
  price_before: number;
  price_after: number;
}

interface SimRow {
  cost_cents: number;
  avg_price: number;
  price_before: number;
  price_after: number;
  slippage_bps: number;
}

/**
 * Preview a BUY by KSh amount — direct linear calc.
 * 1 share costs `price × 100` KSh, plus 3% fee. shares = floor(invest/1.03 / priceKsh).
 */
export async function previewBuyByAmount(
  _marketId: string,
  _outcome: Outcome,
  _outcomeId: string | null,
  amountKsh: number,
  priceHint: number,
): Promise<TradePreview | null> {
  const priceKsh = priceHint * 100;
  if (!amountKsh || amountKsh < 1 || priceKsh <= 0) return null;
  const maxGrossKsh = amountKsh / 1.03;
  const shares = Math.max(0, Math.floor(maxGrossKsh / priceKsh));
  if (shares < 1) return { shares: 0, cost_cents: 0, avg_price: priceHint, price_before: priceHint, price_after: priceHint };
  const grossCents = Math.round(priceHint * 10000 * shares);
  const feeCents = Math.round((grossCents * 300) / 10000);
  return {
    shares,
    cost_cents: grossCents + feeCents,
    avg_price: priceHint,
    price_before: priceHint,
    price_after: priceHint,
  };
}

/** Preview a SELL of N shares — direct linear calc, no fee on sells. */
export async function previewSellShares(
  _marketId: string,
  _outcome: Outcome,
  _outcomeId: string | null,
  shares: number,
  priceHint?: number,
): Promise<TradePreview | null> {
  if (!shares || shares < 1) return null;
  // If caller didn't supply a price hint, we still need it — fall back to RPC.
  if (priceHint == null) {
    const { data, error } = await (supabase.rpc as any)("simulate_lmsr_trade", {
      _market_id: _marketId,
      _outcome: _outcome,
      _outcome_id: _outcomeId,
      _side: "SELL",
      _quantity: shares,
    });
    if (error || !data) return null;
    const row = data as SimRow;
    return {
      shares,
      cost_cents: Math.abs(Number(row.cost_cents)),
      avg_price: Number(row.avg_price),
      price_before: Number(row.price_before),
      price_after: Number(row.price_after),
    };
  }
  const proceedsCents = Math.round(priceHint * 10000 * shares);
  return {
    shares,
    cost_cents: proceedsCents,
    avg_price: priceHint,
    price_before: priceHint,
    price_after: priceHint,
  };
}

/** Execute a BUY — binary or multi outcome. */
export async function buyShares(args: {
  marketId: string;
  marketType: "binary" | "multi";
  outcome: "YES" | "NO";
  outcomeId?: string | null;
  shares: number;
}): Promise<{ error: any | null }> {
  if (args.marketType === "multi") {
    return await (supabase.rpc as any)("execute_lmsr_trade_multi", {
      _market_id: args.marketId,
      _outcome_id: args.outcomeId,
      _side: "BUY",
      _quantity: args.shares,
    });
  }
  return await (supabase.rpc as any)("execute_lmsr_trade_binary", {
    _market_id: args.marketId,
    _outcome: args.outcome,
    _side: "BUY",
    _quantity: args.shares,
  });
}

/** Execute a SELL — binary or multi outcome. */
export async function sellShares(args: {
  marketId: string;
  marketType: "binary" | "multi";
  outcome: "YES" | "NO";
  outcomeId?: string | null;
  shares: number;
}): Promise<{ error: any | null }> {
  if (args.marketType === "multi") {
    return await (supabase.rpc as any)("execute_lmsr_trade_multi", {
      _market_id: args.marketId,
      _outcome_id: args.outcomeId,
      _side: "SELL",
      _quantity: args.shares,
    });
  }
  return await (supabase.rpc as any)("execute_lmsr_trade_binary", {
    _market_id: args.marketId,
    _outcome: args.outcome,
    _side: "SELL",
    _quantity: args.shares,
  });
}

export interface UserPosition {
  id: string;
  outcome: "YES" | "NO";
  outcome_id: string | null;
  shares: number;
  avg_price: number;
}

/** Read the current user's open positions in a market. */
export async function getUserPositions(
  marketId: string,
  userId: string,
): Promise<UserPosition[]> {
  const { data } = await supabase
    .from("positions")
    .select("id, outcome, outcome_id, shares, avg_price")
    .eq("market_id", marketId)
    .eq("user_id", userId)
    .gt("shares", 0);
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    outcome: p.outcome as "YES" | "NO",
    outcome_id: p.outcome_id ?? null,
    shares: Number(p.shares),
    avg_price: Number(p.avg_price),
  }));
}
