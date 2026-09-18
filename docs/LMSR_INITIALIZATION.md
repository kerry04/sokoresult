# LMSR Market Initialization — SokoResult

> Audience: engineers and ops running the SokoResult prediction market.
> Read the [MVP_HANDOFF](./MVP_HANDOFF.md) and [TEAM_TEST_RUN](./TEAM_TEST_RUN.md) docs first.

This document explains, end-to-end, how every market on SokoResult is
bootstrapped using a Logarithmic Market Scoring Rule (LMSR) automated market
maker, and how operators should think about the controls available to them.

---

## 1. Why LMSR

Traditional order books need two-sided liquidity — a YES buyer needs a YES
seller. With ~20 testers and dozens of markets, that's impossible. LMSR lets
the **system itself act as the counterparty**, with mathematically guaranteed:

- a price always between 0 and 1,
- a finite worst-case loss for the operator (capped at `b · ln(N)` for `N` outcomes),
- monotone, arbitrage-free pricing.

The trade-off: the operator (us) absorbs the loss, capped by `b`.

---

## 2. The math (binary case)

LMSR maintains an outstanding-share vector `q = (q_yes, q_no)` and a single
scale parameter `b > 0` ("liquidity parameter").

**Cost function**

```
C(q) = b · ln( exp(q_yes / b) + exp(q_no / b) )
```

**Price (instantaneous probability)**

```
P_yes = exp(q_yes / b) / ( exp(q_yes / b) + exp(q_no / b) )
P_no  = 1 − P_yes
```

**Cost of a trade** that takes the state from `q` to `q'`:

```
cost = C(q') − C(q)
```

A user buying `Δ` YES shares pays `C(q + Δ·e_yes) − C(q)`. Because `C` is
strictly convex, this cost is **always strictly positive**, and the marginal
price `P_yes` rises monotonically as YES inventory increases.
**This is what guarantees no-arbitrage at launch and after every trade.**

### Why we set `q_no = 0`

`P_yes` depends only on the **difference** `q_yes − q_no`. Adding the same
constant to both leaves the price unchanged. So instead of storing
`q_yes = b·ln(P)` and `q_no = b·ln(1−P)` (which can be very negative when `P`
is near 0 or 1), we store

```
q_no  = 0
q_yes = b · ln( P / (1 − P) )      ← the logit of P, scaled by b
```

This is the **same price** but smaller magnitudes and one fewer column to
update. Verified with live data: `b=750, P=0.71 ⇒ q_yes=671.5, q_no=0 ⇒
exp(671.5/750)/(exp(671.5/750)+1) = 0.7100`. ✓

### Multi-outcome generalization

For `N` candidates with target probabilities `p_1 … p_N` summing to 1:

```
C(q) = b · ln( Σ exp(q_i / b) )
P_i  = exp(q_i / b) / Σ exp(q_j / b)
```

We seed `q_i = b · ln(p_i)` then **re-center** by subtracting `min(q_i)` so all
values are ≥ 0. Same shift-invariance logic.

---

## 3. The signal → probability → liquidity pipeline

```
┌────────────────┐    ┌───────────────────┐    ┌──────────────────────┐
│ Trending news  │ →  │ Gemini suggests   │ →  │ Admin approves +     │
│ + sentiment    │    │ p, confidence,    │    │ optional KES depth   │
│ (VADER + LLM)  │    │ category, close   │    │ override              │
└────────────────┘    └───────────────────┘    └──────────┬───────────┘
                                                          │
                                                          ▼
                                          ┌─────────────────────────────┐
                                          │ markets row INSERT          │
                                          │ ↳ trigger auto_seed_market  │
                                          │   clamps p ∈ [0.05, 0.95]   │
                                          │   sets b, q_yes, q_no       │
                                          └──────────────┬──────────────┘
                                                         ▼
                                          ┌─────────────────────────────┐
                                          │ Market is live, tradable,   │
                                          │ arbitrage-free.             │
                                          └─────────────────────────────┘
```

### Probability mapping (operator guidance)

The Gemini tool call returns a `yes_price ∈ [0.05, 0.95]` directly. The
heuristic the model is asked to follow:

| Sentiment + supporting evidence | Suggested `P_yes` |
|---|---|
| Strong positive, multiple confirming articles | 0.70 – 0.85 |
| Mildly positive | 0.55 – 0.65 |
| Mixed / unclear | 0.45 – 0.55 |
| Mildly negative | 0.35 – 0.45 |
| Strong negative | 0.15 – 0.30 |

The DB **always clamps** to `[0.05, 0.95]` regardless of what the model says.

### Liquidity mapping

Operators think in **KES**, not in the abstract `b` parameter. The mapping:

```
b = (initial_liquidity_kes / 10) · (0.5 + 0.5 · confidence)
b ≥ 250   (hard floor)
```

Default depth = **KES 7,500** (so default `b ≈ 750` for a max-confidence
signal, `≈ 375` for zero-confidence — clamped to 250 floor).

| Confidence | KES = 7,500 → b | KES = 15,000 → b |
|---|---|---|
| 0.0 | 250 (floor) | 750 |
| 0.5 | 562 | 1,125 |
| 1.0 | 750 | 1,500 |

A larger `b` means each share moves price by less — better for many small
testers, worse if you want price to react to news.

**Rule of thumb**: cost to move price by 1 percentage point near 50/50 is
approximately `b · ln(1.01) ≈ b · 0.01` KES. So `b = 750` ⇒ ~KES 7.50 to move
1¢. The view `public.market_depth_v` exposes this directly.

---

## 4. Storage schema

```sql
markets (
  liquidity_b              numeric  not null default 750,
  initial_liquidity_cents  bigint,                    -- KES * 100, mirrors b
  q_yes                    numeric  not null default 0,
  q_no                     numeric  not null default 0,
  yes_price                numeric  not null default 0.5,
  no_price                 numeric  not null default 0.5,
  initial_prob             numeric,                    -- the seed P_yes
  ...
)
```

For multi markets, per-candidate state lives in `market_outcomes (q, price)`.

Every trade also writes to `lmsr_state_log (q_before, q_after, b,
cost_delta_cents, trade_id)` so we can audit and replay any pricing dispute.

---

## 5. The seeding RPCs

### `auto_seed_market_lmsr()` — automatic, runs on INSERT

Trigger that fires before every `INSERT` on `markets`:

1. If `initial_liquidity_cents` is set → derive `b = cents / 1000`.
   Otherwise use `liquidity_b` (default 750).
2. Floor `b ≥ 250`.
3. For binary markets: clamp `yes_price` to `[0.05, 0.95]`, then set
   `q_yes = b · ln(p / (1−p))`, `q_no = 0`.
4. For multi markets: a separate `AFTER INSERT` trigger on
   `market_outcomes` does the per-candidate `q = b · ln(price)`.

**You don't need to call this manually — every new market gets it.**

### `seed_lmsr_market(market_id, p, b)` — admin override

Reseed an existing market (e.g., one that was created before auto-seeding
existed, or one whose price has drifted into a broken state). Clamps `p` to
`[0.05, 0.95]`. Admin-only.

### `seed_lmsr_market_from_signal(market_id, p, confidence, kes)` — preferred for AI flow

Wraps `seed_lmsr_market` with the KES + confidence formula above. Returns a
JSON object with the derived `b`, `initial_liquidity_kes`, and clamped
probability. Admin-only.

```sql
select public.seed_lmsr_market_from_signal(
  '06a43033-9749-4cf8-b2bc-4aedbd0dd737'::uuid,
  0.62,    -- AI-suggested p
  0.85,    -- AI confidence
  10000    -- KES of liquidity to commit
);
-- → { "ok": true, "b": 925, "initial_liquidity_kes": 9250, ... }
```

### `rescale_liquidity(market_id, new_b)` — admin tuning

Multiplies all `q_i` by `new_b / old_b`, preserving prices but changing depth.
Use when a market needs more/less liquidity after launch (e.g., volume
surprised you). Admin-only.

---

## 6. Anti-arbitrage guarantees

1. **Convexity of `C(q)`** ⇒ buying then immediately selling always loses
   money (you pay `C(q+Δ) − C(q)` to buy and receive `C(q+Δ) − C(q+Δ−Δ) =
   C(q+Δ) − C(q)` minus the slippage — net negative).
2. **`SELECT … FOR UPDATE`** in `execute_lmsr_trade_binary` /
   `execute_lmsr_trade_multi` serializes concurrent trades on the same market
   so two users can't both fill at the pre-trade price.
3. **Position cap** = `max(10, floor(0.20 · b))` shares per user per outcome
   prevents a single tester from corner-buying a market.
4. **Rate limit** = 30 trades / 5 minutes per RPC per user (`check_rate_limit`).
5. **Admin-only seeders** — only `@sokoresult.com` admins can call
   `seed_lmsr_market*` or `rescale_liquidity`. Enforced by
   `has_role(auth.uid(), 'admin')` inside each function.

---

## 7. Edge cases

| Scenario | Mitigation |
|---|---|
| `p` exactly 0 or 1 | Clamped to `[0.05, 0.95]` in trigger + RPCs. |
| Huge `q` causing `exp` overflow | `lmsr_price` and `lmsr_cost` use the standard max-shift trick. |
| `b` too small (1 trade swings price 30%) | `b ≥ 250` floor + 20% position cap. |
| Two simultaneous trades same market | `FOR UPDATE` lock on the markets row. |
| Market created with stale yes_price (e.g., 0.5 default) | Auto-seed trigger derives `q_yes` from whatever `yes_price` is at INSERT time. |
| Operator wants to reset a "broken" market | Call `seed_lmsr_market(id, new_p, new_b)`. |
| Tester runs out of balance | Admin runs `admin_reset_balance(user_id, 1000000)` (KES 10,000). |

---

## 8. Frontend exposure

- **Market page** (`/markets/$slug`) shows a `Depth: KES X` stat next to
  Volume and Traders. Tooltip: "Initial liquidity provided by the market
  maker. Larger = more stable price."
- **Slippage preview** (`SlippagePreview` component) calls
  `simulate_lmsr_trade` RPC and shows the user the expected fill price,
  price after, and slippage in basis points before they commit.
- **Admin market detail** can use the `market_depth_v` view to see
  `cost_per_cent_kes` at a glance.

---

## 9. Operator runbook — common scenarios

### "Market launched at 50/50 but news clearly favors YES"

```sql
select public.seed_lmsr_market(
  '<market_id>',
  0.70,   -- new probability
  750     -- keep current b
);
```

### "Market is whipsawing on small trades"

Increase `b` to add depth without changing the current price:

```sql
select public.rescale_liquidity('<market_id>', 1500);  -- doubles depth
```

### "Tester hit position cap and is complaining"

Either raise `b` (`rescale_liquidity`) — cap = `0.20·b` shares — or accept it.
The cap is intentional to keep markets diverse during testing.

### "Need to refill all testers before a session"

```sql
-- Refill every non-admin user to KES 10,000
do $$
declare u record;
begin
  for u in
    select p.id from public.profiles p
    where not public.has_role(p.id, 'admin')
  loop
    perform public.admin_reset_balance(u.id, 1000000);
  end loop;
end $$;
```

Or use the **Reset balance** button in `/admin/users`.

---

## 10. Answers to the design questions

**Q1. Is this initialization mathematically correct?**
Yes — with the caveat that we use the **logit form** (`q_yes − q_no =
b·ln(p/(1−p))` with `q_no = 0`) instead of `q_yes = b·ln(p), q_no = b·ln(1−p)`
directly. Same price, smaller numbers, no separate normalization needed.

**Q2. What edge cases could break pricing?**
`p ∈ {0, 1}` → log diverges (clamp). Very large `q` → `exp` overflow
(handled by max-shift in `lmsr_price`/`lmsr_cost`). `b` too small → whipsaw
(b ≥ 250 floor + 20% position cap). Concurrent trades → `FOR UPDATE` lock.

**Q3. How to safely normalize `q_yes` and `q_no`?**
For binary, fix `q_no = 0`. For multi, subtract `min(q_i)` after seeding. The
prices are unchanged because `lmsr_price` is shift-invariant.

**Q4. Should liquidity vary based on trend_score?**
Yes, but use the AI-returned `confidence ∈ [0, 1]` (bounded) instead of raw
`trend_score` (unbounded). Formula in §3:
`b = (kes/10) · (0.5 + 0.5·confidence)` with floor 250. High-confidence
signals get up to 1× depth, low-confidence get 0.5×.

**Q5. How to prevent manipulation at market launch?**
Server-side trigger (users can't set `b` or `q`); 20% position cap; rate
limits; admin-only seed/rescale RPCs gated by `has_role('admin')`; full
audit trail in `lmsr_state_log` and `audit_events`.

---

## 11. Files of interest

| Path | Role |
|---|---|
| `supabase/migrations/*lmsr*.sql` | All seed/trade/rescale RPCs and triggers. |
| `src/routes/_authed/markets.$slug.tsx` | Trader UI; reads `liquidity_b` for depth. |
| `src/components/markets/SlippagePreview.tsx` | Pre-trade simulator (calls `simulate_lmsr_trade`). |
| `src/routes/admin/markets.$id.resolve.tsx` | Operator resolution; pays out winners 1 share = 1 KES. |
| `src/routes/admin/users.tsx` | Admin balance reset (`admin_reset_balance`). |
| `src/lib/server/suggest-market.functions.ts` | Gemini tool call schema for AI suggestions. |

For a top-down tour of the whole codebase + the test-run playbook, see
[TEAM_TEST_RUN.md](./TEAM_TEST_RUN.md) and [MVP_HANDOFF.md](./MVP_HANDOFF.md).
