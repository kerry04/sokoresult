/**
 * Demo-mode RPC dispatcher — replaces the Postgres functions.
 * Signature: dispatch(fn, args, sessionUser) → { data, error }
 */
import { dbGet, dbPut, scheduleSave } from "./store";
import { executeLmsrTrade, simulateLmsrTrade } from "./lmsr";
import { publicUserFromToken } from "./auth";

export function dispatch(fn: string, args: any, token: string | null): { data: any; error: any } {
  const user = publicUserFromToken(token);
  const a = args ?? {};
  const now = new Date().toISOString();

  switch (fn) {
    // ── Trading ──────────────────────────────────────────────────────────
    case "execute_lmsr_trade_binary":
    case "execute_lmsr_trade_multi": {
      if (!user) return { data: null, error: { message: "Sign in to trade" } };
      const res = executeLmsrTrade(
        { get: dbGet, put: dbPut },
        {
          marketId: a._market_id,
          outcome: a._outcome,
          outcomeId: a._outcome_id,
          side: (a._side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
          quantity: a._quantity,
          userId: user.id,
        },
      );
      scheduleSave();
      return res.ok
        ? { data: res, error: null }
        : { data: null, error: { message: res.error ?? "Trade failed" } };
    }

    case "simulate_lmsr_trade": {
      const res = simulateLmsrTrade(dbGet("markets"), dbGet("market_outcomes"), {
        marketId: a._market_id,
        outcome: a._outcome,
        outcomeId: a._outcome_id,
        side: a._side,
        quantity: a._quantity,
      });
      return res.ok ? { data: res, error: null } : { data: null, error: { message: res.error } };
    }

    case "get_user_trade_limits": {
      if (!user) return { data: { ok: false }, error: null };
      const hourAgo = Date.now() - 3_600_000;
      const used = dbGet("trades")
        .filter((t: any) => t.user_id === user.id && t.side === "BUY" && new Date(t.created_at).getTime() > hourAgo)
        .reduce((s: number, t: any) => s + Number(t.cost_cents), 0);
      const notional = 25_000_000;
      const hourly = 5_000_000;
      return {
        data: {
          ok: true,
          hourly_remaining_cents: Math.max(0, hourly - used),
          notional_cap_cents: notional,
        },
        error: null,
      };
    }

    case "resolve_market": {
      if (!user || !isAdmin(user.id)) return { data: null, error: { message: "Admin only" } };
      return resolveMarket(a._market_id, Boolean(a._outcome), null);
    }

    case "resolve_multi_market": {
      if (!user || !isAdmin(user.id)) return { data: null, error: { message: "Admin only" } };
      return resolveMarket(a._market_id, null, a._outcome_id ?? null);
    }

    // ── Social / stats ───────────────────────────────────────────────────
    case "get_leaderboard": {
      const limit = a._limit ?? 50;
      const rows = dbGet("profiles")
        .map((p: any) => statsForUser(p.id))
        .filter((s: any) => s.trade_count > 0)
        .sort((x: any, y: any) => y.total_pnl_cents - x.total_pnl_cents)
        .slice(0, limit);
      return { data: rows, error: null };
    }

    case "leaderboard_rising_stars": {
      const rows = dbGet("profiles")
        .map((p: any) => ({ ...statsForUser(p.id), pnl_24h_cents: 0 }))
        .filter((s: any) => s.trade_count > 0)
        .sort((x: any, y: any) => y.volume_cents - x.volume_cents)
        .slice(0, a._limit ?? 10)
        .map((s: any) => ({
          user_id: s.user_id,
          display_name: s.display_name,
          avatar_url: s.avatar_url,
          pnl_24h_cents: s.realized_pnl_cents,
          trade_count: s.trade_count,
        }));
      return { data: rows, error: null };
    }

    case "get_user_public_stats": {
      const p = dbGet("profiles").find((x: any) => x.id === a._user_id);
      if (!p) return { data: [], error: null };
      const s = statsForUser(a._user_id);
      return { data: [{ ...s, member_since: p.created_at }], error: null };
    }

    case "get_user_public_positions": {
      const rows = dbGet("positions")
        .filter((p: any) => p.user_id === a._user_id && Number(p.shares) > 0)
        .map((p: any) => {
          const m = dbGet("markets").find((x: any) => x.id === p.market_id);
          const current = currentPriceFor(p);
          return {
            market_id: p.market_id,
            question: m?.question ?? "",
            slug: m?.slug ?? "",
            category: m?.category ?? "",
            outcome: p.outcome,
            shares: Number(p.shares),
            avg_price: Number(p.avg_price),
            current_price: current,
            pnl_pct: Number(p.avg_price) > 0 ? ((current - Number(p.avg_price)) / Number(p.avg_price)) * 100 : 0,
          };
        });
      return { data: rows, error: null };
    }

    case "match_news_to_markets": {
      const ids: string[] = a._market_ids ?? [];
      const per = a._per_market ?? 3;
      const markets = dbGet("markets");
      const news = dbGet("raw_news_data")
        .filter((n: any) => n.processed)
        .sort((x: any, y: any) => (x.published_at < y.published_at ? 1 : -1));
      const out: any[] = [];
      for (const id of ids) {
        const m = markets.find((x: any) => x.id === id);
        if (!m) continue;
        const kws = (m.keywords ?? []).map((k: string) => k.toLowerCase());
        const matched = news
          .filter((n: any) =>
            [...(n.relevant_keywords ?? []), ...(n.topics ?? [])].some((k: string) =>
              kws.includes(String(k).toLowerCase()),
            ),
          )
          .slice(0, per);
        for (const n of matched) {
          out.push({
            article_id: n.id,
            market_id: id,
            title: n.title,
            source: n.source,
            url: n.url,
            published_at: n.published_at,
          });
        }
      }
      return { data: out, error: null };
    }

    case "market_activity": {
      const dayAgo = Date.now() - 86_400_000;
      const trades = dbGet("trades").filter(
        (t: any) => t.market_id === a._market_id && new Date(t.created_at).getTime() > dayAgo,
      );
      return {
        data: {
          trades_24h: trades.length,
          volume_24h_cents: trades.reduce((s: number, t: any) => s + Number(t.cost_cents), 0),
          unique_traders: new Set(trades.map((t: any) => t.user_id)).size,
        },
        error: null,
      };
    }

    // ── Engagement ───────────────────────────────────────────────────────
    case "record_trade_engagement": {
      if (!user) return { data: null, error: { message: "Not signed in" } };
      const profiles = dbGet("profiles");
      const p = profiles.find((x: any) => x.id === user.id);
      if (!p) return { data: null, error: { message: "Profile not found" } };
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      if (p.last_trade_date?.slice(0, 10) === yesterday) p.current_streak += 1;
      else if (p.last_trade_date?.slice(0, 10) !== today) p.current_streak = 1;
      p.longest_streak = Math.max(p.longest_streak ?? 0, p.current_streak);
      p.last_trade_date = now;
      dbPut("profiles", profiles);

      const userTrades = dbGet("trades").filter((t: any) => t.user_id === user.id);
      const volume = userTrades.reduce((s: number, t: any) => s + Number(t.cost_cents), 0);
      const newAch: string[] = [];
      if (userTrades.length === 1) newAch.push("first_trade");
      if (volume >= 1_000_000) newAch.push("volume_10k");
      if (volume >= 10_000_000) newAch.push("volume_100k");
      if (p.current_streak >= 3) newAch.push("streak_3");
      if (p.current_streak >= 7) newAch.push("streak_7");
      unlockAchievements(user.id, newAch);
      return {
        data: {
          ok: true,
          streak: { current: p.current_streak, longest: p.longest_streak },
          newAchievements: newAch,
          volume_cents: volume,
          trade_count: userTrades.length,
        },
        error: null,
      };
    }

    case "record_session":
      return { data: null, error: null };

    // ── Admin ────────────────────────────────────────────────────────────
    case "admin_reset_balance": {
      if (!user || !isAdmin(user.id)) return { data: null, error: { message: "Admin only" } };
      const profiles = dbGet("profiles");
      const p = profiles.find((x: any) => x.id === a._user_id);
      if (!p) return { data: null, error: { message: "User not found" } };
      p.kes_balance = a._amount_cents;
      dbPut("profiles", profiles);
      const txns = dbGet("transactions");
      txns.push({
        id: crypto.randomUUID(),
        user_id: p.id,
        type: "admin_reset",
        amount_cents: a._amount_cents,
        description: "Balance reset by admin",
        created_at: now,
      });
      dbPut("transactions", txns);
      return { data: null, error: null };
    }

    case "is_current_user_admin":
      return { data: Boolean(user && isAdmin(user.id)), error: null };

    case "has_role":
      return { data: Boolean(user && user.id === a._user_id && isAdmin(a._user_id)), error: null };

    case "refresh_treasury":
      return { data: null, error: null };

    case "run_signal_update_all":
      return { data: { updated: 0 }, error: null };

    case "score_user_behavior":
      return { data: { scored: 0 }, error: null };

    default:
      console.warn(`[demo-rpc] unknown fn "${fn}"`);
      return { data: null, error: { message: `RPC "${fn}" not implemented in demo mode` } };
  }
}

function isAdmin(userId: string): boolean {
  return dbGet("user_roles").some((r: any) => r.user_id === userId && r.role === "admin");
}

function currentPriceFor(pos: any): number {
  const m = dbGet("markets").find((x: any) => x.id === pos.market_id);
  if (!m) return 0;
  if (m.market_type === "multi") {
    const o = dbGet("market_outcomes").find((x: any) => x.id === pos.outcome_id);
    return Number(o?.price ?? 0);
  }
  return pos.outcome === "YES" ? Number(m.yes_price) : Number(m.no_price);
}

function statsForUser(userId: string) {
  const p = dbGet("profiles").find((x: any) => x.id === userId);
  const trades = dbGet("trades").filter((t: any) => t.user_id === userId);
  const positions = dbGet("positions").filter(
    (x: any) => x.user_id === userId && Number(x.shares) > 0,
  );
  let realized = 0;
  for (const t of trades) {
    realized += t.side === "SELL" ? Number(t.cost_cents) : -Number(t.cost_cents);
  }
  let unrealized = 0;
  for (const pos of positions) {
    unrealized += (currentPriceFor(pos) - Number(pos.avg_price)) * Number(pos.shares) * 100;
  }
  const resolved = dbGet("markets").filter((m: any) => m.status === "resolved");
  const won = positions.filter((pos: any) => {
    const m = resolved.find((r: any) => r.id === pos.market_id);
    if (!m) return false;
    return m.market_type === "multi"
      ? m.resolved_outcome_id === pos.outcome_id
      : (pos.outcome === "YES") === Boolean(m.resolved_outcome);
  }).length;
  const decided = positions.filter((pos: any) => resolved.some((r: any) => r.id === pos.market_id)).length;
  return {
    user_id: userId,
    display_name: p?.display_name ?? null,
    avatar_url: p?.avatar_url ?? null,
    trade_count: trades.length,
    volume_cents: trades.reduce((s: number, t: any) => s + Number(t.cost_cents), 0),
    realized_pnl_cents: Math.round(realized),
    unrealized_pnl_cents: Math.round(unrealized),
    total_pnl_cents: Math.round(realized + unrealized),
    win_rate: decided > 0 ? Math.round((won / decided) * 100) / 100 : 0,
  };
}

function unlockAchievements(userId: string, codes: string[]) {
  if (!codes.length) return;
  const ua = dbGet("user_achievements");
  for (const code of codes) {
    if (!ua.some((x: any) => x.user_id === userId && x.achievement_code === code)) {
      ua.push({
        user_id: userId,
        achievement_code: code,
        unlocked_at: new Date().toISOString(),
      });
    }
  }
  dbPut("user_achievements", ua);
}

import * as crypto from "node:crypto";

function resolveMarket(marketId: string, binaryOutcome: boolean | null, outcomeId: string | null) {
  const markets = dbGet("markets");
  const m = markets.find((x: any) => x.id === marketId);
  if (!m) return { data: null, error: { message: "Market not found" } };
  m.status = "resolved";
  if (m.market_type === "multi") {
    m.resolved_outcome_id = outcomeId;
    const outs = dbGet("market_outcomes");
    for (const o of outs) {
      if (o.market_id === marketId) o.is_winner = o.id === outcomeId;
    }
    dbPut("market_outcomes", outs);
  } else {
    m.resolved_outcome = binaryOutcome;
  }
  dbPut("markets", markets);

  // Pay out winners: each share pays KES 100
  const positions = dbGet("positions");
  const profiles = dbGet("profiles");
  let payouts = 0;
  for (const pos of positions) {
    if (pos.market_id !== marketId) continue;
    const isWinner =
      m.market_type === "multi"
        ? pos.outcome_id === outcomeId
        : (pos.outcome === "YES") === Boolean(binaryOutcome);
    if (!isWinner) continue;
    const amount = Math.round(Number(pos.shares) * 100 * 100); // shares × KSh 100 → cents
    const p = profiles.find((x: any) => x.id === pos.user_id);
    if (p) {
      p.kes_balance += amount;
      payouts += amount;
    }
    const txns = dbGet("transactions");
    txns.push({
      id: crypto.randomUUID(),
      user_id: pos.user_id,
      type: "payout",
      amount_cents: amount,
      description: `Payout — ${m.question.slice(0, 60)}`,
      created_at: new Date().toISOString(),
    });
    dbPut("transactions", txns);
    pos.shares = 0;
  }
  dbPut("positions", positions);
  dbPut("profiles", profiles);
  scheduleSave();
  return { data: { ok: true, payouts_cents: payouts }, error: null };
}
