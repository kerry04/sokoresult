/**
 * Anonymous prediction drafts.
 *
 * Visitors can build a trade (side + shares) without an account. The draft is
 * stored locally so it survives the signup/login round-trip — the auth gate
 * only appears when they press BUY.
 */

export type DraftSide = "yes" | "no";

export interface TradeDraft {
  side: DraftSide;
  shares: number;
  updatedAt: number;
}

const KEY = "sokoresult:draft-trades:v1";

function readAll(): Record<string, TradeDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TradeDraft>;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, TradeDraft>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked — drafts are best-effort.
  }
}

export function getDraft(marketId: string): TradeDraft | null {
  const d = readAll()[marketId];
  if (!d) return null;
  if (d.side !== "yes" && d.side !== "no") return null;
  if (!Number.isFinite(d.shares) || d.shares < 1) return null;
  return { side: d.side, shares: Math.floor(d.shares), updatedAt: d.updatedAt ?? 0 };
}

export function saveDraft(marketId: string, draft: Omit<TradeDraft, "updatedAt">) {
  const all = readAll();
  all[marketId] = {
    ...draft,
    shares: Math.max(1, Math.floor(draft.shares)),
    updatedAt: Date.now(),
  };
  writeAll(all);
}

export function clearDraft(marketId: string) {
  const all = readAll();
  delete all[marketId];
  writeAll(all);
}
