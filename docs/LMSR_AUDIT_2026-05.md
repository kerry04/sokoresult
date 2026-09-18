# LMSR Engine Audit — May 2026

## Scope

Full correctness review of the prediction-market engine: SQL math helpers,
trade execution paths (binary + multi), simulation, fees, position caps,
risk caps, resolution payouts, audit logging, and integration with the
AI-suggested prior pipeline.

## Verdict

**The engine is mathematically correct and production-shaped.** No fixed-odds
or pooled-betting code was found. Trading is share-based against an LMSR
market maker; resolution pays 1 KES per winning share; the platform's
worst-case loss per market is bounded at `b · ln(n)`.

Three real bugs and one security gap were found and fixed.

## What was verified

| Area | Status |
|---|---|
| `lmsr_cost`, `lmsr_price`, `lmsr_trade_cost` (log-sum-exp form) | ✅ Correct |
| Atomic trade execution (`FOR UPDATE` on market + position rows) | ✅ Correct |
| Balance debit/credit + `transactions` ledger entries | ✅ Correct |
| 3% house fee charged on BUY only | ✅ Correct |
| Longshot cap (`1/p > 20×` rejected on BUY) | ✅ Correct |
| Hourly + treasury + position caps | ✅ Correct |
| Resolution payout (1 KES / winning share) | ✅ Correct |
| `lmsr_state_log` audit row per trade | ✅ Correct |
| TS `src/lib/quant.ts` matches SQL math | ✅ Correct |

## Findings & fixes

### B1 — CRITICAL: AI prior was being silently dropped
`admin/markets/create` wrote `yes_price` from the prior but left `q_yes`/`q_no`
at zero. The first trade snapped the price back to 50/50 because LMSR derives
price from `q`, not from the cached `yes_price` column.

**Fix:** new `seed_market_priors(market_id)` SQL function computes
`q_i = b · ln(n · p_i)` and writes `q`, `yes_price`, `no_price` (binary) or
`market_outcomes.q` + `price` (multi). The create-market UI now calls it
right after insert. Refuses to seed if any trade already exists.

### B4 — MEDIUM: Resolution didn't record realized subsidy
`resolve_market` / `resolve_multi_market` paid winners correctly but left no
audit trail of the platform's net P&L for the round.

**Fix:** both functions now compute `realized_payouts − realized_revenue` and
append a final `lmsr_state_log` row with that value as `cost_delta_cents`.
Both also now refuse to resolve a market twice.

### B5 — MEDIUM: Binary position cap was hardcoded
`execute_lmsr_trade_binary` used `liquidity_b * 0.20` while multi already used
the settings-driven `multi_share_cap_pct_of_b`. Inconsistent and untunable.

**Fix:** added `binary_share_cap_pct_of_b` setting (default 0.25). The binary
trade RPC now reads from settings, identical to the multi RPC.

### B6 — LOW (security finding): Realtime channels weren't scoped
`realtime.messages` had no RLS, so any authenticated user could subscribe to
any topic and receive other users' notification/trade broadcast events.
(`postgres_changes` subscriptions were already safe — they apply table RLS.)

**Fix:** `realtime.messages` now has policies that require:
- `user:<auth.uid()>:*` topics for user-scoped streams, OR
- `market:*` topics (public, no PII), OR
- the admin role.

### Not bugs (re-verified)
- `simulate_lmsr_trade` is `STABLE` and reads no caps — correct.
- The Hanson LMSR allows negative cash flow on some sells; this is expected
  and bounded by the same `b · ln(n)` invariant.
- `STABLE` markings on the math helpers are correct (pure functions of inputs).

## Risk model

See [LMSR_RISK_MODEL.md](./LMSR_RISK_MODEL.md) for the bounded-loss derivation,
break-even table, and monitoring view (`public.market_subsidy_estimate`).

## Out of scope (intentional)

- Hybrid order book — premature; current LMSR-only flow has no observable
  liquidity issue.
- Time-decaying `b` — already partially implemented in
  `20260428172018` (`recompute_market_signal_and_liquidity`); not changed.
- Removing the test-mode KYC bypass RPCs (`set_self_kyc_verified` etc.) and
  the profile-status self-update gap — flagged in the security view, but
  outside this audit's scope. Worth a separate fix.
