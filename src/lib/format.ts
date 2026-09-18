// Currency, percent, and number formatting helpers for SokoResult.
// All trading is denominated in KES (Kenyan Shilling). Each share pays out
// KSh 100 on resolution, so a probability `p` (0..1) corresponds to a
// share price of `KSh (p * 100)`.

const kesFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

const kesPreciseFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Format an amount in cents as KES whole-shilling string, e.g. "KSh 1,234". */
export function formatKES(cents: number): string {
  return kesFormatter.format(cents / 100).replace("KES", "KSh");
}

/** Format an amount in cents as KES with 2 decimal places — for trade previews. */
export function formatKESPrecise(cents: number): string {
  return kesPreciseFormatter.format(cents / 100).replace("KES", "KSh");
}

export function formatKESCompact(cents: number): string {
  return "KSh " + compactFormatter.format(cents / 100);
}

export function formatNumberCompact(n: number): string {
  return compactFormatter.format(n);
}

export function formatPercent(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/**
 * Share price in KES. A probability `p` of 0.45 → "KSh 45". Each share
 * resolves to KSh 100 on a winning outcome.
 */
export function formatPrice(p: number): string {
  return `KSh ${(p * 100).toFixed(0)}`;
}

/** Two-decimal share price for trade tickets and slippage previews. */
export function formatPricePrecise(p: number): string {
  return `KSh ${(p * 100).toFixed(2)}`;
}

/** Plain-language time remaining: "3 days", "5 hours", "12 minutes", "Closed". */
export function formatTimeRemaining(closesAt: string | null): string {
  if (!closesAt) return "No close date";
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 2) return `${days} days`;
  if (days === 1) {
    const remHrs = hrs - 24;
    return remHrs > 0 ? `1 day, ${remHrs} hour${remHrs === 1 ? "" : "s"}` : "1 day";
  }
  if (hrs >= 1) return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  if (mins >= 1) return `${mins} minute${mins === 1 ? "" : "s"}`;
  return "Less than a minute";
}

export const CATEGORY_LABEL: Record<string, string> = {
  politics: "Politics",
  sports: "Sports",
  entertainment: "Entertainment",
  economics: "Economics",
};
