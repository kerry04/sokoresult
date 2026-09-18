# SokoResult — MVP Handoff (April 2026)

> Internal doc for the SokoResult team. Use this to test the MVP end-to-end and to know who owns what.

---

## 1. What we have built

A live Kenyan-first **prediction market** with AI-driven market discovery:

- **LMSR pricing engine** (Logarithmic Market Scoring Rule, log-sum-exp stable) for both binary and multi-outcome markets.
- **Auto-seeded markets** — every market initialises its `q` state from `initial_prob` and a default liquidity `b = 750`.
- **News + social signal pipeline** — Apify scrapers + Gemini sentiment → `raw_news_data` → `trending_keywords` → `market_suggestions`.
- **Live news tape on each market card** — realtime via Supabase channels.
- **Auth + KYC** — Supabase Auth with Google OAuth, profiles, KYC tier-1 with document upload, role-based admin (only `@sokoresult.com`).
- **Admin console** at `/admin` — Dashboard, Markets, Create Market (binary or multi candidates), AI suggestions, **Users (with reset balance)**, News Intel, KYC Review.
- **Trader app** at `/markets`, `/news`, `/portfolio`, `/leaderboard`, `/wallet`, `/u/$userId`.
- **Position safety** — 30 trades / 5 min rate limit, position cap = 20% of `liquidity_b` shares per outcome per user.
- **Demo wallet** — KES 10,000 free credit on signup; mock M-Pesa deposit/withdraw dialogs.

---

## 2. URLs

- Preview:   `https://id-preview--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app`
- Custom:    `https://sokoresult.com` / `https://www.sokoresult.com`
- Stable preview: `https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6-dev.lovable.app`
- Stable prod:    `https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app`

Admin login: `/admin/login` — must use a `@sokoresult.com` email and have `app_role = 'admin'`.

---

## 3. Tech stack

| Layer | Tech |
|---|---|
| Frontend | TanStack Start (v1) + React 19 + Vite 7 |
| Styling | Tailwind v4 (semantic tokens in `src/styles.css`) |
| State | TanStack Query, Supabase JS client |
| Animation | framer-motion |
| Backend | Lovable Cloud (managed Supabase) |
| DB | Postgres + RLS, PL/pgSQL functions, realtime channels |
| AI | Lovable AI Gateway → Google Gemini (`gemini-2.5-flash` + `gemini-3-flash-preview`) |
| Scraping | Apify actors (RSS + structured) |
| Files | Supabase Storage (`avatars` public, `kyc-documents` private) |

---

## 4. Database (key tables)

| Table | Purpose |
|---|---|
| `profiles` | `kes_balance`, `kyc_tier`, `display_name`, `phone`, `referral_code` |
| `user_roles` | `app_role` enum: `admin` / `moderator` / `user` (separate from profiles for security) |
| `markets` | `market_type` (`binary` / `multi`), `liquidity_b` (default **750**), `q_yes`, `q_no`, `initial_prob`, `yes_price`, `no_price`, `keywords[]` |
| `market_outcomes` | per-candidate `q`, `price`, `label`, `image_url` |
| `positions` | one row per (user, market, outcome). `shares`, `avg_price` |
| `trades` | every fill — `side` (BUY/SELL), `quantity`, `price`, `cost_cents` |
| `transactions` | wallet ledger — `trade`, `payout`, `deposit`, `withdrawal`, `admin_reset` |
| `price_history` / `outcome_price_history` | snapshot per trade for sparklines |
| `lmsr_state_log` | `q_before`, `q_after`, `b`, `cost_delta_cents` (audit trail) |
| `audit_events` | admin actions (e.g. `admin_reset_balance`) |
| `rpc_call_log` | rate-limit window tracking |
| `raw_news_data` | scraped articles, `processed`, `sentiment_score`, `relevant_keywords[]`, `topics[]`, `category` |
| `social_posts` | scraped tweets/posts |
| `trending_keywords` | rolled-up `mentions_1h`, `velocity`, `trend_score`, `lifecycle` |
| `market_suggestions` | AI-proposed markets (admin reviews → publishes) |
| `news_articles` | curated/admin news with optional `market_id` link |
| `kyc_submissions` | KYC documents + status |
| `comments` / `comment_likes` | per-market discussion |
| `source_health` | scraper uptime |

### Key RPCs

| Function | Used by |
|---|---|
| `simulate_lmsr_trade(market_id, outcome, outcome_id, side, quantity)` | Slippage preview before order |
| `execute_lmsr_trade_binary(market_id, outcome, side, quantity)` | Binary market fills |
| `execute_lmsr_trade_multi(market_id, outcome_id, side, quantity)` | Multi-outcome fills |
| `seed_lmsr_market(market_id, initial_prob, b)` | Admin: re-initialise |
| `rescale_liquidity(market_id, new_b)` | Admin: deepen/shallow market |
| `resolve_market(market_id, outcome bool)` | Admin: settle binary |
| `resolve_multi_market(market_id, winning_outcome_id)` | Admin: settle multi |
| `admin_reset_balance(user_id, amount_cents)` | Admin: refill tester |
| `get_leaderboard(limit, period)` | Leaderboard page |
| `get_user_public_stats(user_id)` / `get_user_public_positions(user_id)` | Public profile |
| `match_news_to_markets(market_ids[], per_market)` | News tape on market cards |
| `check_rate_limit(fn, max, window_seconds)` | Internal — guards trade RPCs |

### Triggers

- `trg_auto_seed_market_lmsr` (BEFORE INSERT on `markets`) — sets `q_yes/q_no/initial_prob` from `yes_price`.
- `trg_auto_seed_outcome_q` (BEFORE INSERT on `market_outcomes`) — sets per-outcome `q` from `price`.
- `handle_new_user` (auth) — creates `profiles` row with KES 10,000 starting balance.
- `enforce_admin_domain` — only `@sokoresult.com` can be granted `admin`.
- `block_public_sokoresult_signup` — public signups can't claim `@sokoresult.com`.
- `validate_kyc_age` — must be 18+.
- `handle_kyc_approval` — bumps profile to KYC tier 1 on approval.

---

## 5. Routes (frontend)

### Public / auth
- `/` — landing
- `/login`, `/signup`, `/onboarding`
- `/admin/login`

### Trader (auth required, `_authed` layout)
- `/markets` — feed of open markets, live news tape
- `/markets/$slug` — trade page (LMSR slippage preview, news, comments, candidates)
- `/news` — headlines view (sources view removed; categories: Politics / Sports / Entertainment / Economics; trending tags chip row)
- `/portfolio` — equity hero, active positions with sparklines, trade history
- `/leaderboard` — top traders by P&L / win rate / volume; podium for top 3
- `/wallet` — balance hero, inflow/outflow/trades/realized P&L stats, type-filtered activity ledger
- `/profile` — your profile + KYC entry
- `/u/$userId` — public trader profile
- `/kyc` — submit ID

### Admin (`@sokoresult.com` + `admin` role)
- `/admin` — overview KPIs
- `/admin/markets` — list / delete / resolve
- `/admin/markets/create` — binary or multi (categories: politics, sports, entertainment, economics)
- `/admin/markets/$id/resolve` — pick winner, settles all positions
- `/admin/markets/suggest` — review AI suggestions
- **`/admin/users`** — list traders, reset balance to KES 10,000
- `/admin/news` — scraper health
- `/admin/kyc` — approve/reject submissions

---

## 6. AI / signal pipeline

```
Apify scrapers (RSS + Twitter)
         │
         ▼
raw_news_data  ◄─── Gemini sentiment + entity extraction
         │
         ▼
trending_keywords  ◄── compute-trends edge fn
         │
         ▼
market_suggestions ◄── auto-suggest-markets (Gemini draft)
         │
         ▼
   Admin reviews → publishes  →  markets (auto-seeded LMSR)
```

Edge functions (auto-deployed):
- `compute-trends` — rolls `raw_news_data` into `trending_keywords`
- `auto-suggest-markets` — Gemini drafts new market suggestions
- `analyze-news-batch` — batched sentiment/category/keyword tagging
- `scrape-news` / `scrape-social` — Apify orchestration
- `match-news-realtime` — fans new articles into market tapes

Secrets present: `GEMINI_API_KEY`, `LOVABLE_API_KEY`, `APIFY_API_TOKEN`.

---

## 7. Trading mechanics (LMSR cheat-sheet)

For a market with share inventory `q = [q₁, q₂, …]` and liquidity `b`:

```
C(q)     = b * ln( Σ exp(qᵢ / b) )         -- cost function
price_i  = exp(qᵢ/b) / Σ exp(qⱼ/b)         -- instantaneous probability
trade Δ shares of outcome i:
   cost = C(q + Δ·eᵢ) - C(q)
```

- BUY → `Δ > 0`, cost > 0 (user pays).
- SELL → `Δ < 0`, cost < 0 (user receives `|cost|`).
- Slippage shown to user as `(avg_price − price_before) / price_before` in bps.
- Position cap: `max_shares_per_outcome = floor(b * 0.20)` (≈150 shares at b=750).
- Rate limit: 30 trade RPC calls / 5 minutes per user.
- Resolution: winning shares pay 100¢ each. Losers pay 0.

---

## 8. How to test the MVP

### Pre-flight (admin)
1. Sign in at `/admin/login` with your `@sokoresult.com` account.
2. Confirm at least 5 open markets at `/admin/markets`. (We have 10 currently.)
3. Visit `/admin/users` and verify your testers' balances. Use **Reset KES 10k** to refill anyone.

### Trader flow (each tester)
1. Sign up at `/signup` (or Google OAuth). Auto-funded with KES 10,000.
2. Browse `/markets` — should see live cards with sparklines and news tape.
3. Open any market → click YES or NO → use slippage preview → confirm trade.
4. Go to `/portfolio` — see active position, sparkline, P&L.
5. Try to BUY > 150 shares on same outcome → expect "Position cap reached" toast.
6. Spam-buy 31 trades in 5 min → expect "Rate limit" toast.
7. Open `/wallet` — verify trade ledger entry and realized P&L stat.
8. Open `/leaderboard` — your trade should bump you onto the board.
9. Open `/news` — should be just headlines (no sources tab); filter by category and by trending keyword.

### Admin verify
- `/admin/markets/$id/resolve` on a closed market → settles winners (look for `payout` rows in `transactions`).

---

## 9. Team ownership

| Owner | Area |
|---|---|
| **Jerry** | Backend + own Gemini-style scoring model, edge functions, scrapers |
| **Leon** | UI / frontend polish, design system, mobile responsiveness |
| **Kristian** | Scraping sources, API keys, source health |
| **You** | Polygon / Rust contracts (Stage 5), tokenomics, M-Pesa integration |

---

## 10. Known limitations (Stage 1 scope)

- M-Pesa deposit/withdraw dialogs are mocks. STK push integration is Stage 4.
- AI market suggestions still need a **quality gate** (source tiering, factuality validation) before they auto-publish.
- Adaptive `b` from signal strength is not yet wired — every new market gets `b=750`.
- No copy-trade or follow yet (planned for Stage 2).
- No on-chain settlement (Polygon contracts are Stage 5).

---

## 11. Useful SQL one-liners

```sql
-- All open markets and their state
select slug, market_type, liquidity_b, yes_price, q_yes, q_no, trader_count, volume_cents/100 as kes_volume
from markets where status = 'open' order by volume_cents desc;

-- Top 10 traders by realized + unrealized
select * from get_leaderboard(10, 'all');

-- Refill a tester
select admin_reset_balance('<user_uuid>', 1000000);

-- See last 20 trades
select t.created_at, p.display_name, m.question, t.side, t.outcome, t.quantity, t.price
from trades t
join profiles p on p.id = t.user_id
join markets m on m.id = t.market_id
order by t.created_at desc limit 20;
```

---

_Last updated: April 27, 2026 — after Stage 3 LMSR + position cap + admin reset rollout._

---

## LMSR initialization (Stage 4)

Every market on SokoResult is bootstrapped by an LMSR market maker. The
operator-relevant pieces:

- **Auto-seed trigger** runs on every `INSERT` into `markets`. It clamps the
  initial probability to `[0.05, 0.95]` and derives the math parameter
  `b` from either `initial_liquidity_cents` (preferred, KES-denominated) or
  the legacy `liquidity_b` field. Floor: `b ≥ 250`.
- **Default depth**: `b = 750` (≈ KES 7,500 of operator-committed liquidity).
- **Signal-aware seeding**: admins can call
  `seed_lmsr_market_from_signal(market_id, p, confidence, kes)` to size depth
  by AI confidence: `b = (kes/10) · (0.5 + 0.5·confidence)`, floor 250.
- **Position cap** prevents any single user from holding more than
  `max(10, floor(0.20·b))` shares per outcome — keeps testing fair.
- **Depth view**: `select * from public.market_depth_v` shows each market's
  `b`, KES depth, and the cost to move price by 1¢.
- **Frontend**: market detail pages now show a `Depth: KES X` stat next to
  Volume/Traders.

The full math, edge cases, and operator runbook live in
[`docs/LMSR_INITIALIZATION.md`](./LMSR_INITIALIZATION.md).

**Fashion category**: removed from AI suggestions, sentiment analysis,
news scraper keywords, and landing-page chips. The DB enum still contains
`'fashion'` (Postgres can't drop enum values cleanly) but no new code path
inserts it.

---

## Stage 5 — Security model (added)

See **`docs/SECURITY.md`** for the full RLS matrix, admin promotion process,
redirect rules, and error-message policy. Highlights:

- `profiles` is no longer publicly readable. Comments and leaderboards now
  read display names through the `profiles_public` view, which exposes only
  `id`, `display_name`, `avatar_url`, `created_at`.
- A `BEFORE UPDATE` trigger blocks regular users from changing their own
  `kes_balance`, `oko_balance`, `kyc_tier`, `referral_code`, or `id`. Only
  admins and `SECURITY DEFINER` RPCs can mutate those.
- `user_roles` INSERT / UPDATE / DELETE is admin-only. There is no path for a
  regular user to grant themselves admin.
- `?redirect=` on `/login` is sanitized via `safeRedirect()` — only in-app
  paths are accepted; absolute URLs are rejected.
- All user-facing errors flow through `friendlyError()` (`src/lib/errors.ts`)
  which logs raw errors to the console and shows a plain-English message.
- OAuth `redirect_uri` is now `/onboarding` (signup) or the sanitized
  `target` (login). The signup-on-new-device → landing-page bug is fixed.
