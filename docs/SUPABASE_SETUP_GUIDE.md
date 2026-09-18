# SokoResult × Supabase — Detailed Setup & Architecture Guide

This is the complete, step-by-step guide to standing up your own backend for
SokoResult now that Lovable is gone. It covers **what Supabase handles, what
the app handles, every click in the Supabase dashboard, verification queries,
and troubleshooting**.

> Companion docs:
> - `docs/NEW_BACKEND_SETUP.md` — short version (quick reference)
> - `docs/MVP_HANDOFF.md` — the original team handoff (Lovable-era context)

---

## Part 1 — Who handles what (mental model)

SokoResult is a **serverless full-stack app**. There is no traditional backend
server you maintain — the browser talks to Supabase directly, and the database
itself enforces every rule.

### Supabase handles (the "backend")

| Concern | Service | How it works here |
|---|---|---|
| Accounts & passwords | **Auth** | Hosted auth server. Issues signed JWTs on signup/login. The app never sees or stores a password. |
| Login sessions | **Auth** | JWT kept in browser storage, auto-refreshed before expiry. |
| Google login (optional) | **Auth → Providers** | OAuth flow via your own Google Cloud client ID. |
| "Who can read/write what" | **Postgres RLS** | Row Level Security policies on every table. This is the real security boundary — even a forged browser request can't touch another user's wallet. |
| Trading engine | **Postgres RPCs** | `execute_lmsr_trade_binary/multi` validate balance, position caps (20% of liquidity), and rate limits (30 trades / 5 min) *inside the database*. |
| New-user setup | **Trigger** | `handle_new_user` creates the profile row and grants KES 10,000 on signup. |
| Market bootstrapping | **Trigger** | `trg_auto_seed_market_lmsr` seeds LMSR state (q, prices) whenever a market is inserted. |
| File uploads | **Storage** | `avatars` (public), `kyc-documents` (private) buckets. |
| Live updates | **Realtime** | `trades`, `notifications`, `admin_alerts` are on the `supabase_realtime` publication — price ticks and notifications arrive over websockets. |
| Transactional email | **Auth** | Confirmation / magic-link / reset emails built in. |
| Scheduled jobs | **pg_cron** | Installed by migrations but **all Lovable-host jobs were removed**. Re-add once you have a public URL. |

### Your app handles (the "frontend")

| Concern | Where |
|---|---|
| Screens, UX, charts, forms | `src/routes`, `src/components` |
| Client session state | `src/lib/auth-context.tsx` (reads the Supabase session, shares user/profile with pages) |
| Route guards | `src/routes/_authed.tsx` (bounces to `/login` if no session), `src/routes/admin/route.tsx` (verifies admin role via secure RPC) |
| Slippage preview before a trade | `simulate_lmsr_trade` RPC (called from the trade dialog) |
| AI market suggestions / sentiment | `src/lib/server/gemini.ts` + `/api/public/hooks/*` routes (direct Gemini API — optional) |
| News/social scraping | Apify actors via the hook routes (optional) |
| Friendly error messages | `src/lib/errors.ts` (`friendlyError()`) |

### Supabase does NOT handle

- **M-Pesa** — deposit/withdraw dialogs are mocks in the app (STK push is future work).
- **SMS OTP login** — needs Supabase's paid Twilio add-on. Skip for now.
- **Google OAuth out-of-the-box** — needs a free Google Cloud client ID (steps below). Email login works without it.

---

## Part 2 — The keys (what's safe where)

| Key | Env names | Secret? | Used by |
|---|---|---|---|
| **Project URL** | `SUPABASE_URL`, `VITE_SUPABASE_URL` | public | Everything; it's just an address |
| **anon / publishable key** | `SUPABASE_PUBLISHABLE_KEY`, `VITE_…` | Safe in the browser | The React app. Fine to expose because RLS is the real gate. |
| **service_role key** | `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ **SECRET — never in the browser, never in git** | Server-side hook routes (scrapers, sentiment, auto-resolve). Bypasses RLS. |

Rules of thumb:

- `.env` is gitignored — keep it that way. `VITE_`-prefixed values get compiled into the browser bundle, so only ever put the **publishable** key behind a `VITE_` prefix.
- If the service_role key ever leaks, rotate it immediately (Dashboard → Settings → API → Rotate).

---

## Part 3 — Step-by-step setup

### Step 1 · Create the project (~5 min)

1. Go to <https://supabase.com> and sign up / log in (GitHub login works).
2. **New project** →
   - Name: `sokoresult` (anything works)
   - Database password: generate one and **save it** (needed only for `psql`)
   - Region: nearest to you / your users (Kenya → `eu-central-1` is usually fastest)
3. Wait for provisioning (~2 min). The project ref is the 20-char slug in the URL:
   `https://<ref>.supabase.co`.

### Step 2 · Copy the keys into `.env`

Dashboard → ⚙️ **Project Settings → API**. Copy **Project URL**, **anon
publishable key**, and **service_role key**, then:

```bash
cp .env.example .env
```

Fill in (leave the optional AI/scraper/cron values empty for now):

```ini
SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_PROJECT_ID=<ref>
VITE_SUPABASE_PROJECT_ID=<ref>
```

### Step 3 · Create the schema (one shot)

From the project root:

```bash
./supabase/apply_all.sh
```

This bundles all **45 migrations** (44 original + the de-Lovable cron cleanup)
in timestamp order into `supabase/apply_all.sql`. Then apply it either way:

- Dashboard → **SQL Editor** → New query → paste the whole file → **Run**.
  (Large paste — give it a minute; "Success. No rows returned" is expected.)
- **or** via psql: `psql "<Settings → Database → Connection string (URI)>" -f supabase/apply_all.sql`

**Verify** — SQL Editor:

```sql
select count(*) from public.markets;          -- 0 is fine, table must exist
select count(*) from public.profiles;         -- 0
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname like 'execute_lmsr%';           -- 2 rows: binary + multi
select tablename from pg_tables where schemaname='storage' limit 5;  -- storage exists
```

### Step 4 · Dashboard toggles

**Auth → Providers → Email**

- Turn **off** "Confirm email" (local dev convenience — signup is instant).
- Re-enable + set up SMTP before going public.

**Auth → URL Configuration**

- **Site URL:** `http://localhost:5173`
- **Redirect URLs:** add `http://localhost:5173`

**Realtime** — nothing to do; migrations already added the tables to the
`supabase_realtime` publication.

**Storage** — nothing to do; buckets + policies are created by migrations.

### Step 5 · First login & wallet check

```bash
npm install   # if you haven't yet
npm run dev   # http://localhost:5173
```

1. `/signup` → email + password → you land in the app, funded with
   **KES 10,000** by the `handle_new_user` trigger.
2. `/wallet` → balance hero shows 10,000.

**Verify in SQL:**

```sql
select p.display_name, p.kes_balance, r.role
from public.profiles p
left join public.user_roles r on r.user_id = p.id;
```

### Step 6 · Make yourself admin

The admin console (`/admin`) requires **both**: an email ending in
`@sokoresult.com` **and** a row in `user_roles`.

1. Create the staff user **from the dashboard**, not the public signup page
   (a public signup with that domain is blocked by the
   `block_public_sokoresult_signup` trigger — dashboard inserts are
   service-role and pass):
   - Dashboard → **Authentication → Users → Add user → Create new user**
   - Email: `you@sokoresult.com` (any password; "Auto Confirm User" ✓)
2. Copy the new user's **UUID** from the users table.
3. SQL Editor:

```sql
insert into public.user_roles (user_id, role)
values ('<uuid>', 'admin');
```

(The `enforce_admin_domain` trigger allows admin grants only for
`@sokoresult.com` emails — which is why step 1 used that domain.)

4. Log in at `/admin/login` with that email → full console unlocks:
   Dashboard, Markets, Create Market, Trades, Edge Opportunities, Alerts,
   Users, Syndicates, News Intel, Signals, Health, KYC Review, Support.

### Step 7 · Full smoke test

1. **Create a market:** `/admin/markets/create` → binary → question, category,
   initial probability (0.05–0.95), liquidity (default b=750) → publish.
   The auto-seed trigger initializes LMSR state instantly.
2. **Trade it:** open `/markets` → click the market → pick YES/NO → the
   dialog shows a live slippage preview → confirm.
3. **See it everywhere:** `/portfolio` (position + sparkline), `/wallet`
   (ledger entry), `/leaderboard` (you're on the board), price tick on the
   market card (realtime).
4. **Guards work:** try buying >150 shares on one outcome → "Position cap"
   toast; spam 31 trades in 5 min → rate-limit toast.

---

## Part 4 — Optional add-ons

### Google OAuth (free, ~10 min)

1. <https://console.cloud.google.com/apis/credentials> → Create project →
   **OAuth client ID** → Web application.
2. Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
3. Copy the client ID/secret → Supabase **Auth → Providers → Google** →
   enable, paste, save.
4. The Google buttons in `AuthForm` use standard Supabase OAuth and will just
   work.

### AI suggestions & news pipeline (optional keys)

| Key | Get it from | Unlocks |
|---|---|---|
| `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> (free tier) | AI market suggestions, sentiment analysis |
| `APIFY_API_TOKEN` | <https://console.apify.com> | News/tweet scrapers |
| `CRON_SECRET` | any long random string | Protects `/api/public/hooks/*` routes |

Until the app has a public URL, trigger hooks manually:

```bash
curl -X POST http://localhost:5173/api/public/hooks/auto-suggest-markets \
  -H "x-cron-secret: <your CRON_SECRET>"
```

Once deployed, re-add `pg_cron` jobs against the new domain (the old ones were
removed by `20260918120000_delovable_drop_lovable_cron.sql`).

### SMS OTP login

Requires Supabase's Twilio/Vonage add-on (paid). Skip unless you specifically
want `+254` phone login.

---

## Part 5 — Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `Missing Supabase environment variables` on page load | `.env` values empty/typo'd → recheck Step 2; restart `npm run dev` after editing `.env` |
| DNS / `ENOTFOUND` errors to supabase | Paused free-tier project → Dashboard → Restore |
| Signup spins forever / no profile row | "Confirm email" still on → disable it (Step 4), or check the confirmation email |
| `permission denied` / RLS errors in console | Migrations not fully applied → re-run `apply_all.sql`; check the SQL Editor ran without partial failure |
| Trade button errors | RPCs missing → verify with the Step 3 query; ensure you're logged in |
| `/admin` bounces to `/admin/login` | Missing `user_roles` row → Step 6 SQL; email must end `@sokoresult.com` |
| Google button errors | Provider not configured or redirect URI mismatch → Part 4 |
| Realtime prices not ticking | Verify `select * from pg_publication_tables where pubname='supabase_realtime';` includes `trades` |

---

## Part 6 — Before you go public

- [ ] Re-enable email confirmation + configure SMTP (Auth → Emails)
- [ ] Rotate the service_role key if it was ever pasted anywhere odd
- [ ] Re-add `pg_cron` jobs pointing at your production domain
- [ ] Set env vars as secrets on your deploy target (never commit `.env`)
- [ ] Review `docs/SECURITY.md` — the RLS matrix and admin promotion rules all apply unchanged
- [ ] M-Pesa is still mocked — no real money moves until Stage 4 integration
