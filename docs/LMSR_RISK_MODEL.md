# LMSR Risk Model

## Engine

Each market holds a share vector `q = [q_1, …, q_n]` and a liquidity parameter `b > 0`.

- **Cost function:** `C(q) = b · ln( Σ exp(q_i / b) )`
- **Price (= implied probability):** `P_i(q) = exp(q_i / b) / Σ exp(q_j / b)`
- **Trade cost:** to move outcome `i` from `q_i` to `q_i + Δ`, the user pays `C(q') − C(q)`.
- **Resolution:** each share of the winning outcome pays **1 KES** (100 cents). Losing shares pay 0.

The SQL implementation (`public.lmsr_cost`, `public.lmsr_price`, `public.lmsr_trade_cost`) uses the
log-sum-exp trick to stay numerically stable when prices are near 0 or 1.

## Bounded loss (the "house can't blow up" theorem)

For any LMSR market with `n` outcomes:

> **Worst-case platform subsidy = `b · ln(n)`**

That is the maximum *net* amount the AMM can ever pay out beyond what traders paid in,
across the full lifetime of the market — independent of how many trades happen, in what
order, or by whom.

### Concrete numbers (default `b = 750`)

| Market type      | n  | Max subsidy        |
|------------------|----|--------------------|
| Binary (YES/NO)  | 2  | `750 · ln 2` ≈ **KSh 519.86** |
| 3-way            | 3  | `750 · ln 3` ≈ **KSh 823.96** |
| 5-way            | 5  | `750 · ln 5` ≈ **KSh 1,206.95** |
| 10-way           | 10 | `750 · ln 10` ≈ **KSh 1,726.94** |

### Profitability with fees

We charge a **3% house fee on every BUY** (`house_fee_bps = 300`). With cumulative BUY
notional `V`, fee revenue is `0.03 · V`. The market is **net-profitable for the platform** as
soon as:

```
0.03 · V  ≥  b · ln(n)
V         ≥  (b · ln n) / 0.03
```

For a binary market with `b = 750`: break-even at **V ≈ KSh 17,329** of cumulative BUY notional.

## Other guardrails (defense in depth)

- **Longshot cap** — refuse BUY if implied payout multiplier `1/p > 20×`. Stops users from
  scooping up effectively-free shares right after launch when one tail is mispriced.
- **Hourly volume cap per user** — `hourly_volume_cap_cents` (default KSh 500,000).
- **Treasury %-cap per market** — a single market's 24h volume can't exceed
  `treasury_pct_cap` (default 5%) of total liquidity in `treasury_snapshot`.
- **Per-position share cap** — `binary_share_cap_pct_of_b` (0.25) and
  `multi_share_cap_pct_of_b` (0.50) bound concentration.
- **Per-position notional cap** — `notional_cap_pct_of_b` (0.60).

All caps are stored in `system_settings` and tunable without redeploying.

## Initialization with priors (the math behind `seed_market_priors`)

To open a market at probability vector `P = [p_1, …, p_n]` instead of uniform, set:

```
q_i = b · ln(n · p_i)
```

Verification (binary, `p = 0.7`, `b = 750`):

- `q_yes = 750 · ln(1.4) ≈ 252.34`
- `q_no  = 750 · ln(0.6) ≈ −383.04`
- `P(yes) = exp(252.34/750) / (exp(252.34/750) + exp(−383.04/750)) = 0.700` ✓

The reference `n · p_i` is used so a uniform prior gives `q = 0` (matches the legacy
default) and the math stays well-defined for any `0 < p_i < 1`.

## Auditability

Every state transition is logged in `public.lmsr_state_log`:
- `q_before`, `q_after`, `b`, `cost_delta_cents`, `trade_id`
- Initial seeding writes a row with `cost_delta_cents = 0` and no `trade_id`.
- Resolution writes a final row with `cost_delta_cents = realized_payouts − realized_revenue`
  (positive = platform paid out a subsidy; negative = platform kept money).

The admin view `public.market_subsidy_estimate` exposes per-market `max_subsidy_kes`
alongside realized revenue and payouts so risk can be monitored at a glance.
