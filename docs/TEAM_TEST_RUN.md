# SokoResult — 20-Person Test Run Handbook

> Operational playbook for the team running the 20-person test.
> Read end-to-end before the test. Date: April 2026.

---

## 1. TL;DR — What testers will actually do

1. We invite **20 people** with a referral link.
2. Each tester signs up (Google or email), gets **KES 10,000 demo balance**, and lands on `/markets`.
3. They place at least 3 trades across at least 2 markets and try the news, portfolio, leaderboard, wallet, and profile pages.
4. They submit **one bug or confusion** in the shared form/group chat.
5. Admin (you) watches `/admin` for trades, balances, and market health.

We are testing the **trading loop, the AI signal pipeline, and stability under concurrent users**. We are **not** testing payments — M-Pesa is mocked.

---

## 2. URLs & access

| Purpose | URL |
|---|---|
| Stable preview (always latest preview build) | `https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6-dev.lovable.app` |
| Stable production (after publish) | `https://project--0f601b91-de2a-4754-8b90-e7f1bf05d7c6.lovable.app` |
| Custom domain (use this for testers) | `https://sokoresult.com` |
| Admin login | `/admin/login` (must be `@sokoresult.com` + admin role) |
| User signup link to share | `https://sokoresult.com/signup` |

---

## 3. Tech stack (one line each)

| Layer | Tech |
|---|---|
| Frontend | TanStack Start v1 + React 19 + Vite 7 |
| Styling | Tailwind v4 with semantic tokens in `src/styles.css` |
| Data layer | TanStack Query + Supabase JS client |
| Backend | Lovable Cloud (managed Postgres + Auth + Storage + Realtime) |
| Server logic | Postgres functions (LMSR, trades, leaderboard) + TanStack Start server endpoints |
| Scheduled jobs | `pg_cron` calling our public webhook endpoints |
| AI | Lovable AI Gateway (Gemini 2.5) for sentiment + market suggestions |
| Scraping | Apify actors for news + Twitter |
| Auth | Email + Google OAuth |

There are **no Edge Functions**. All server work runs as either Postgres RPCs or TanStack server endpoints under `src/routes/api/public/hooks/`.

---

## 4. Project map — what every file/folder does

### 4.1 Frontend pages (`src/routes/`)

| Path | What it is |
|---|---|
| `__root.tsx` | Root HTML shell, head meta, dark theme, AuthProvider, Toaster |
| `_authed.tsx` | Authed layout: header (logo, balance, avatar), desktop sidebar, mobile bottom-tab bar, KYC banner |
| `index.tsx` | Public landing/marketing page |
| `login.tsx` | User login (email + Google) |
| `signup.tsx` | User signup with `?ref=CODE` referral capture |
| `onboarding.tsx` | First-run welcome + display name |
| `_authed/markets.index.tsx` | Markets discovery: cinema cards, category filter, news tape, live price pulse |
| `_authed/markets.$slug.tsx` | Market detail: chart, candidates or YES/NO panel, slippage preview, trades, news, comments |
| `_authed/news.tsx` | Headlines feed + trending keyword chips |
| `_authed/portfolio.tsx` | Open positions, equity hero, capital deployer, recent trades, realized P&L |
| `_authed/leaderboard.tsx` | Top traders by P&L (all-time / 30d / 7d), podium + list |
| `_authed/wallet.tsx` | Balance, mock M-Pesa deposit/withdraw, transaction list |
| `_authed/profile.tsx` | Display name, **circular avatar cropper**, referral code, sign out |
| `_authed/u.$userId.tsx` | Public profile of another trader |
| `_authed/kyc.tsx` | KYC tier-1 form + document upload |
| `_authed/coming-soon.tsx` | Placeholder for $OKO / staking |
| `admin/login.tsx` | Admin auth gate |
| `admin/route.tsx` | Admin layout (sidebar) |
| `admin/index.tsx` | Admin dashboard — counts, recent trades, market health |
| `admin/markets.index.tsx` | Market list + status filters |
| `admin/markets.create.tsx` | Create binary or multi-outcome market |
| `admin/markets.$id.resolve.tsx` | Resolve market YES/NO or pick winning candidate |
| `admin/markets.suggest.tsx` | AI market suggestion queue (approve / reject) |
| `admin/news.tsx` | News intel — raw articles, source health, sentiment |
| `admin/kyc.tsx` | KYC review (approve / reject) |
| `admin/users.tsx` | User search + **reset balance to 10k KES** |

### 4.2 Cron endpoints (`src/routes/api/public/hooks/`)

| File | What it does |
|---|---|
| `scrape-news.ts` | Pulls Apify news → writes `raw_news_data` |
| `scrape-tweets.ts` | Pulls Apify Twitter → writes `social_posts` |
| `analyze-sentiment.ts` | Runs Gemini sentiment over unprocessed articles |
| `compute-trends.ts` | Builds `trending_keywords` (velocity, growth, lifecycle) |
| `auto-suggest-markets.ts` | Calls Gemini to draft `market_suggestions` |
| `auto-resolve.ts` | Auto-resolves markets when source confirms outcome (off for the test) |

All endpoints are public URLs, but each verifies a shared signature/secret server-side before processing.

### 4.3 Frontend libs (`src/lib/`)

| File | What it does |
|---|---|
| `auth-context.tsx` | React `AuthProvider` — exposes user, profile, signIn, signOut, refreshProfile |
| `format.ts` | KES, percentage, compact-number formatters; category labels |
| `news-sources.ts` | Whitelist of Kenyan news sources + tier scores |
| `utils.ts` | `cn()` Tailwind class merge |
| `server/gemini.ts` | Lovable AI Gateway client (used by hooks) |
| `server/apify-twitter.ts` | Apify Twitter actor wrapper |
| `server/keywords.ts` | Keyword extraction + Kenya-context boost |
| `server/vader.ts` | Lightweight sentiment fallback when Gemini fails |
| `server/suggest-market.functions.ts` | Prompt builder + parser for market suggestions |

### 4.4 Components (`src/components/`)

| Folder | What lives there |
|---|---|
| `ui/` | shadcn primitives — do not edit individually |
| `auth/` | `AuthShell`, `AuthForm` (shared between login/signup) |
| `brand/` | `Logo` |
| `marketing/` | Landing-page sections |
| `markets/` | `MarketCardCinema`, `LiveChart`, `Sparkline`, `AnimatedSparkline`, `CandidateList`, `SlippagePreview`, `MarketNewsStream`, `NewsTape` |
| `portfolio/` | `EquityHero`, `CapitalDeployer` |
| `profile/` | `AvatarCropDialog`, `cropImage.ts` (circular cropper) |
| `admin/` | `CandidateEditor`, `news/*` (news intel widgets) |

### 4.5 Postgres functions (the backend)

All defined in migrations under `supabase/migrations/`. The team does not edit by hand — schema changes go through a new migration.

| Function | Called by | Purpose |
|---|---|---|
| `handle_new_user` | trigger on auth signup | Creates `profiles` row + referral code |
| `handle_kyc_approval` | trigger on KYC update | Bumps `profiles.kyc_tier` to 1 when approved |
| `validate_kyc_age` | trigger on KYC insert | Enforces 18+ |
| `enforce_admin_domain` | trigger on `user_roles` insert | Admins must have `@sokoresult.com` email |
| `block_public_sokoresult_signup` | trigger on auth signup | Stops random people grabbing our domain |
| `has_role` / `is_admin` | RLS policies | Security-definer role check (avoids recursion) |
| `lmsr_price` / `lmsr_cost` / `lmsr_trade_cost` | trade RPCs | Pure LMSR math, log-sum-exp stable |
| `simulate_lmsr_trade` | UI slippage preview | Returns cost, avg fill, price-after, slippage bps without writing |
| `execute_lmsr_trade_binary` | Buy/Sell on binary markets | Atomic: locks row, charges balance, writes trade + position + price history; enforces rate limit + position cap |
| `execute_lmsr_trade_multi` | Buy/Sell on candidate markets | Same as above for multi-outcome |
| `auto_seed_market_lmsr` / `auto_seed_outcome_q` | trigger on market insert | Seeds `q` from `initial_prob`, default `b = 750` |
| `seed_lmsr_market` | admin only | Re-seed an existing market |
| `rescale_liquidity` | admin only | Change `b` while preserving prices |
| `resolve_market` / `resolve_multi_market` | admin only | Set winner, pay 1 KES per share, log payout |
| `get_leaderboard` | leaderboard page | Realized + unrealized P&L per user |
| `get_user_public_stats` / `get_user_public_positions` | public profile | Returns trader stats |
| `match_news_to_markets` | market detail | Joins news to markets via keyword overlap |
| `check_rate_limit` | every trade RPC | Throws if > N calls in window |
| `admin_reset_balance` | admin Users page | Sets a tester's balance to 10k KES, audits the action |

### 4.6 Database tables (read/write summary)

| Table | Who writes | Who reads |
|---|---|---|
| `profiles` | trigger + user (own row) + admin reset | public read |
| `user_roles` | admin only via migrations | self + admin |
| `markets` / `market_outcomes` | admin | public read |
| `positions` | trade RPCs only | self only |
| `trades` | trade RPCs only | self only |
| `transactions` | trade RPCs + admin reset + payout | self only |
| `orders` | unused (legacy, kept for future LOB) | self |
| `price_history` / `outcome_price_history` | trade RPCs | public read |
| `lmsr_state_log` | trade RPCs | admin only |
| `rpc_call_log` | rate limiter | self + admin |
| `audit_events` | admin actions | admin |
| `raw_news_data` | scrape-news cron | public read |
| `social_posts` | scrape-tweets cron | public read |
| `trending_keywords` | compute-trends cron | public read |
| `market_suggestions` | auto-suggest cron + admin | admin |
| `source_health` | scrape crons | public read |
| `news_articles` | admin curated news | public read |
| `comments` / `comment_likes` | authed users | public read |
| `kyc_submissions` | self submit + admin review | self + admin |

### 4.7 Storage buckets

- `avatars` — **public**. Path: `{user_id}/avatar-{ts}.png`. Cropped 256/512/1024 PNG from the profile page.
- `kyc-documents` — **private**. ID front, ID back, selfie. Owner + admin only.

---

## 5. API keys / secrets workflow

We do **not** put secrets in the codebase. All secrets live in Lovable Cloud and are read by either Postgres (via Vault) or our server endpoints (via env vars).

Currently configured (do not re-enter unless rotating):

| Secret | Used by | Purpose |
|---|---|---|
| `LOVABLE_API_KEY` | `analyze-sentiment.ts`, `auto-suggest-markets.ts` | Calls Lovable AI Gateway (Gemini 2.5) — no per-model key needed |
| `GEMINI_API_KEY` | reserved fallback | Direct Gemini if Gateway is down |
| `APIFY_API_TOKEN` | `scrape-news.ts`, `scrape-tweets.ts` | Runs our news + Twitter actors |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | client + server | Standard SDK config (publishable is safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | server hooks only | Admin writes from cron (bypasses RLS) — never leaves the server |
| `SUPABASE_DB_URL` | maintenance only | Direct psql access for migrations |

**Rotation rules**

- `LOVABLE_API_KEY` → use the Lovable rotate flow, not a manual replace.
- Apify token → regenerate in Apify console, then update via Lovable Cloud → Secrets.
- Service role key → only rotate via Lovable Cloud panel; never commit it; rotate immediately if leaked.
- Publishable key → safe in the client; rotate only if Supabase forces it.

**How a tester's request flows through secrets (no secret ever reaches the browser):**

1. Tester opens `/markets` → browser hits Supabase using `SUPABASE_PUBLISHABLE_KEY` (safe to expose).
2. Tester clicks Buy → frontend calls `supabase.rpc('execute_lmsr_trade_binary', ...)` → runs server-side as the user, bound by RLS policies.
3. `pg_cron` hits `/api/public/hooks/scrape-news` → server uses `APIFY_API_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` to write `raw_news_data`.
4. `pg_cron` hits `/api/public/hooks/analyze-sentiment` → server uses `LOVABLE_API_KEY` to call Gemini, then writes results back.

---

## 6. AI / signal pipeline (how a market is born)

```text
   Apify scrape           Apify scrape
  (news sites)            (Twitter)
        |                      |
        v                      v
   raw_news_data          social_posts
        |                      |
        +----------+-----------+
                   |
                   v
         analyze-sentiment       (Gemini via Lovable AI)
                   |
                   v
         compute-trends          (velocity, growth, lifecycle)
                   |
                   v
         trending_keywords
                   |
                   v
         auto-suggest-markets    (Gemini drafts question + initial prob)
                   |
                   v
         market_suggestions ---> admin reviews at /admin/markets/suggest
                                       |
                                       v
                             admin clicks "Use" --> markets row created
                                       |
                                       v
                         auto_seed_market_lmsr trigger --> q seeded
                                       |
                                       v
                              tester sees it on /markets
```

**Failure modes:**
- **Apify quota out** → `source_health.status = 'failing'`, no new news. Trading still works.
- **Gemini rate-limited** → falls back to VADER sentiment in `src/lib/server/vader.ts`. Quality drops, pipeline continues.
- **Bad suggestion** → sits in `market_suggestions.status = 'pending'`. Admin rejects; nothing reaches users.

---

## 7. Pre-test checklist (T-24h)

Tick each box on the shared sheet before opening the doors.

- [ ] At least **5 open markets**, mixed binary + multi. Verify on `/markets`.
- [ ] Each market has `liquidity_b ≥ 500`. Check in `/admin/markets`.
- [ ] News feed has **≥ 20 articles in the last 48h**. Check `/news`.
- [ ] At least **3 trending keywords** show on `/news`. Else trigger `compute-trends` manually.
- [ ] No `source_health.status = 'failing'`. Else regenerate Apify token.
- [ ] Admin can log in at `/admin/login`. KYC review page loads.
- [ ] `admin_reset_balance` works on a throwaway test account.
- [ ] Mobile (375px width) renders correctly: no horizontal scroll, bottom tab bar visible, header doesn't overflow.
- [ ] Profile photo upload + circular crop works end-to-end. Photo appears in header avatar.
- [ ] Sign out + sign back in works (Google + email).
- [ ] Rate limit: 31 trades in 5 min → friendly error toast (not a crash).
- [ ] Position cap: try buying > 20% of `b` shares → friendly error toast.
- [ ] Slippage preview matches actual fill on a real trade (within 1 cent).

---

## 8. Test-day plan (90 minutes)

**T-15 min — Admin pre-flight**
- Open 4 browser tabs: `/admin`, `/admin/markets`, `/admin/users`, `/admin/news`.
- Open Lovable Cloud → Database → Logs in a 5th tab.
- Start a Loom/Zoom recording.

**T-0 — Open the doors**
- Send the WhatsApp/Discord message: invite link + the one-paragraph instruction card from §9.
- Pin: "Use any email or Google. You start with KES 10,000 (demo). Try at least 3 trades. Tell us anything that confuses you."

**T+0–30 min — Onboarding wave**
- Watch `/admin/users` count climb. Should reach 20 within ~15 min.
- Anyone stuck on signup → check the auth tab in the database logs.
- Anyone bankrupt early → admin resets via `/admin/users`.

**T+30–60 min — Trading wave**
- Watch `/admin` recent trades stream.
- Verify volume on `/markets` cards is climbing.
- Spot-check `lmsr_state_log` for any oddly large `cost_delta_cents` (sign of a price exploit or bug).

**T+60–90 min — Polish wave**
- Ask testers to visit `/leaderboard` — does ranking feel right?
- Ask testers to visit `/portfolio` — does P&L math feel right?
- Ask testers to upload a profile photo — does it propagate to the header and leaderboard?

**T+90 min — Wrap**
- Push the feedback prompt one more time.
- Screenshot the leaderboard for the WhatsApp group.
- Resolve **one** market live (admin → Resolve YES/NO) so testers see a payout in their wallet.

---

## 9. Tester instruction card (paste into WhatsApp/Discord)

> **Welcome to SokoResult — 30-min test**
>
> 1. Open `https://sokoresult.com/signup` and sign up (Google is fastest).
> 2. You start with **KES 10,000** of demo money. No real money is involved.
> 3. Pick a market on the home page. Hit BUY YES or BUY NO. Then try selling.
> 4. Visit **News**, **Portfolio**, **Leaderboard**, **Wallet**, and **Profile** — try each.
> 5. On Profile, upload a photo. It should appear top-right immediately.
> 6. Tell us in this group the **one thing** that confused you most.
>
> If anything breaks, screenshot it. We'll refill your balance if you go bankrupt.

---

## 10. Bug triage template

For every reported issue, capture:

| Field | Example |
|---|---|
| Tester (first name) | Wanjiku |
| Device + browser | iPhone 13, Safari |
| Page URL | `/markets/ruto-reelection-2027` |
| What they did | Tapped BUY YES with 50 shares |
| What they expected | Trade goes through |
| What happened | "Position cap reached" toast |
| Screenshot | (link) |
| Severity | Low / Med / High / Block |

Engineering fixes Block + High before any re-test. Med + Low get batched.

---

## 11. Roles for the test

| Role | Owner | Job during the run |
|---|---|---|
| Run-of-show / MC | (you) | Sends the invite, answers in chat, decides when to stop |
| Admin watcher | Jerry | Watches `/admin` + DB logs, resets balances, resolves a market at the end |
| UI debugger | Leon | Joins the call screen-shared, helps anyone with UI issues live |
| Signal/news watcher | Kristian | Watches `/news` + Apify, restarts scrapers if they fail |
| Smart contracts (out of scope today) | (you) | Just observe — no Polygon flow yet |

---

## 12. Known limitations (be upfront with testers)

- **No real money** — M-Pesa is mocked. Deposit/withdraw are visual only.
- **No notifications yet** — toggle on profile is a placeholder.
- **$OKO** is a stub on the header. The token does not exist yet.
- **Auto-resolve** is wired but **off** for the test — admin resolves markets manually.
- **Comments** exist on market detail but are lightly moderated.
- **No native mobile app** — use the web on phones. Installable as PWA from Safari/Chrome share menu.

---

## 13. After-the-test report (within 24h)

Engineering produces:

1. **Numbers**: signups, % completed first trade, total trades, total volume, top market by volume, leaderboard #1, server errors, p95 trade-RPC latency.
2. **Top 5 friction points** from tester feedback.
3. **Decision**: ship-as-is, fix-then-ship, or rebuild-X.

---

## 14. Admin emergency actions

| Situation | Fix |
|---|---|
| Tester is stuck at 0 KES | `/admin/users` → search → "Reset KES 10k" |
| Market price is broken (e.g. 0% / 100%) | `/admin/markets` → click market → re-seed with `initial_prob = 0.5`, `b = 750` |
| News feed is empty | Hit cron URL manually: `POST /api/public/hooks/scrape-news` |
| AI not generating suggestions | Hit `POST /api/public/hooks/auto-suggest-markets` |
| Suspect a price exploit | Run: `select * from lmsr_state_log order by recorded_at desc limit 50` — look for huge `cost_delta_cents` |
| Need to wipe a tester's history | Not exposed — ask engineering for a one-off SQL |

---

*End of handbook. Questions → ping engineering in the team channel.*

---

## Pre-test addendum (Stage 4)

Before inviting testers, also verify:

- [ ] `select count(*) from public.markets where status = 'open' and liquidity_b < 500;` returns **0**. If not, run `select public.rescale_liquidity(id, 750)` for each.
- [ ] AI suggestions in `/admin/news` no longer show the `fashion` category. (The category was removed from the AI tool schemas.)
- [ ] Open `/markets/<any-slug>` and confirm the **Depth** stat is visible next to Volume/Traders.
- [ ] `select * from public.market_depth_v order by initial_liquidity_kes;` — every open market should show `cost_per_cent_kes` between roughly 2 and 50 KES. Anything outside that range is suspect.

For the deep math + reseeding playbook see [`LMSR_INITIALIZATION.md`](./LMSR_INITIALIZATION.md).

---

## Stage 5 — Security smoke tests (run during the 20-user pilot)

Have at least two testers complete this checklist. If any item fails, report
in the bug channel before continuing the pilot.

### A. Profile / balance tampering
1. Sign in as a regular user.
2. In the browser devtools console, paste:
   ```js
   const { error } = await window.supabase
     .from("profiles")
     .update({ kes_balance: 9_999_999_999 })
     .eq("id", (await window.supabase.auth.getUser()).data.user.id);
   console.log(error);
   ```
   ✅ **Expected:** the call fails. The toast in the UI (if triggered through
   the app) shows: "That field can't be edited." Balance in the header is
   unchanged.

### B. Self-promotion to admin
1. Same console, run:
   ```js
   const uid = (await window.supabase.auth.getUser()).data.user.id;
   const { error } = await window.supabase
     .from("user_roles")
     .insert({ user_id: uid, role: "admin" });
   console.log(error);
   ```
   ✅ **Expected:** the insert fails with a permission error. Reload the app:
   no `/admin` link appears in the sidebar.

### C. Open redirect
1. Open `https://www.sokoresult.com/login?redirect=https://example.com` in a
   private window.
2. Log in.
   ✅ **Expected:** you land on `/markets`, not `example.com`.
3. Try `/login?redirect=//evil.com` and `/login?redirect=javascript:alert(1)`.
   ✅ **Expected:** both fall back to `/markets`.

### D. Friendly errors
1. Try to log in with the wrong password.
   ✅ **Expected:** toast says **"Wrong email or password."** — not a raw
   Supabase error string.
2. Try to buy more shares than your balance allows.
   ✅ **Expected:** toast says **"Not enough balance for this trade."**
3. Try to exceed the per-market position cap.
   ✅ **Expected:** toast says **"You've hit the per-market position cap."**

### E. Signup on a new device
1. On a phone or device that has never logged in to SokoResult, open
   `https://www.sokoresult.com/signup`.
2. Sign up via Google.
   ✅ **Expected:** you land on `/onboarding` (NOT the marketing landing
   page). If the profile is still being created you see a brief
   "Setting up your account…" message, then the form.
3. Repeat with email/password.
   ✅ **Expected:** same outcome. If email confirmation is required, the
   toast tells you to check your inbox and you land on `/login`.

### F. Profile reads (privacy)
1. As an unauthenticated visitor, open the browser console on the marketing
   site and run:
   ```js
   const { data, error } = await window.supabase
     .from("profiles")
     .select("kes_balance, phone");
   console.log(data, error);
   ```
   ✅ **Expected:** `data` is empty / `null`. RLS blocks the read.
2. Same for `from("profiles_public").select("display_name, avatar_url")` —
   ✅ **Expected:** returns rows. This is the safe view.

If A–F all pass, the security posture is good for the pilot.
