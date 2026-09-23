// Shared shape for product-first market UI on the public landing page.
// All values must come from real backend data — never fabricate.

export interface ProductMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number; // 0..1
  no_price: number; // 0..1
  volume_cents: number;
  trader_count: number;
  closes_at: string | null;
  created_at: string;
  /** YES price points oldest → newest, with real recorded_at from price_history. May be empty. */
  history: PricePoint[];
}

/** One real price observation from price_history — never synthesize timestamps. */
export interface PricePoint {
  yes_price: number; // 0..1
  recorded_at: string; // ISO timestamp from the database
}

/** Change in probability points between first and last history point. null = unknown. */
export function priceChangePts(history: PricePoint[]): number | null {
  if (history.length < 2) return null;
  return (history[history.length - 1].yes_price - history[0].yes_price) * 100;
}

export type MarketSort = "trending" | "new" | "ending" | "volume";

export function sortMarkets(markets: ProductMarket[], sort: MarketSort): ProductMarket[] {
  const arr = [...markets];
  switch (sort) {
    case "new":
      return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    case "ending":
      return arr.sort((a, b) => {
        const ta = a.closes_at ? +new Date(a.closes_at) : Number.POSITIVE_INFINITY;
        const tb = b.closes_at ? +new Date(b.closes_at) : Number.POSITIVE_INFINITY;
        return ta - tb;
      });
    case "volume":
    case "trending":
    default:
      return arr.sort((a, b) => b.volume_cents - a.volume_cents);
  }
}
