# SokoResult — Security Model

Last updated: Stage 5 (security hardening + signup flow fix).

This document describes the access-control posture of the live database, how
admin users are promoted, the post-login redirect rules, and the policy for
surfacing errors to users.

---

## 1. RLS matrix (who can read / write what)

| Table | Public read | Authenticated read | Owner write | Admin override |
|---|---|---|---|---|
| `profiles` | ❌ (use view) | own row only | own row, **non-sensitive cols only** | full |
| `profiles_public` (view) | ✅ | ✅ | n/a | n/a |
| `user_roles` | own roles | own roles | ❌ | full (insert/update/delete) |
| `markets` | ✅ | ✅ | ❌ | full |
| `market_outcomes` | ✅ | ✅ | ❌ | full |
| `positions` | ❌ | own rows | system only (RPC) | — |
| `trades` | ❌ | own rows | system only (RPC) | — |
| `transactions` | ❌ | own rows | system only (RPC) | — |
| `orders` | ❌ | own rows | own (insert) | — |
| `comments` | ✅ | ✅ | own (insert/delete) | — |
| `comment_likes` | ✅ | ✅ | own (insert/delete) | — |
| `news_articles`, `raw_news_data`, `social_posts`, `trending_keywords`, `source_health` | ✅ | ✅ | submitter (news) | full |
| `kyc_submissions` | ❌ | own rows | own (insert) | full review |
| `audit_events`, `lmsr_state_log`, `rpc_call_log` | ❌ | self for `rpc_call_log` | system | admin read |

### profiles — sensitive column lock

A `BEFORE UPDATE` trigger (`guard_profile_sensitive_columns`) raises if a
non-admin tries to change any of:

- `id`
- `kes_balance`
- `oko_balance`
- `kyc_tier`
- `referral_code`

These can only be modified by:

1. an admin (manual override), or
2. server-side `SECURITY DEFINER` RPCs (`execute_lmsr_trade_*`,
   `resolve_market`, `admin_reset_balance`, `handle_kyc_approval`, etc.).

### profiles_public view

```sql
CREATE VIEW public.profiles_public WITH (security_invoker = on) AS
SELECT id, display_name, avatar_url, created_at FROM public.profiles;
```

Used by:

- comment author lookups (`markets/$slug` page)
- leaderboard fallback names
- any anonymous "who said what" rendering

The view never exposes phone numbers, balances, KYC tier, referral data, or
the `referred_by` chain.

---

## 2. Admin promotion

There is no self-service path to becoming an admin.

- INSERT into `user_roles` requires either (a) `service_role` (bypasses RLS) or
  (b) an existing admin (`has_role(auth.uid(),'admin')`).
- UPDATE / DELETE on `user_roles` is admin-only.
- The `enforce_admin_domain` trigger additionally requires that any new row
  with `role = 'admin'` belongs to a `@sokoresult.com` email.

Bootstrap procedure (one-time): an operator with the service role inserts the
first admin row directly. After that, admins promote each other through the
admin UI.

---

## 3. Post-login redirect rules

The `/login` page accepts a `?redirect=` query parameter. The value is run
through `safeRedirect()` (`src/lib/utils.ts`) before any navigation.

A redirect target is accepted only if **all** of the following hold:

- It is a string.
- It starts with a single `/`.
- It does **not** start with `//` or `/\` (no protocol-relative URLs).
- It does **not** contain `://` anywhere (no absolute URLs).
- It contains no whitespace.
- It is not `/login` or `/signup` (no loops).

Anything else falls back to `/markets` (or whatever default the caller passes).

OAuth flows (`signInWithOAuth`) always pass an in-app `redirect_uri`:
`/onboarding` for signups, sanitized `target` for logins. The bare origin is
**never** used — that previously caused users to land on the marketing site
after Google sign-in.

---

## 4. Error message policy

User-facing surfaces (toasts, inline errors) must call
`friendlyError(err)` from `src/lib/errors.ts`.

`friendlyError` does three things:

1. Logs the raw error to the browser console for developers.
2. Maps known patterns (auth errors, RLS denials, balance/share/position
   guards, network failures) to short, plain-English messages.
3. Falls back to `"Something went wrong. Please try again."` if the message
   contains DB internals (`relation`, `column`, `constraint`, `pg_…`,
   `sql state`) or is too long / contains JSON-like junk.

The unmodified `error.message` is **never** rendered to end users. Admin-only
pages (e.g. `admin/news`, `admin/markets.suggest`) may pass through raw
messages because the audience is staff.

---

## 5. Signup flow (multi-device)

Symptom previously seen: signing up on a fresh device dropped the user back on
the marketing landing page.

Root causes & fixes:

1. **OAuth `redirect_uri` was the bare origin.** Google sent the browser back
   to `/`, which is the public landing page. Fixed by always passing
   `${origin}/onboarding` (signup) or `${origin}${target}` (login).
2. **Email signup navigated before the session was on-device.** The protected
   route guard then bounced. Fixed by `waitForSession()` polling
   `supabase.auth.getSession()` (up to 4 s) before navigating.
3. **`/onboarding` could see a null profile** while the `handle_new_user`
   trigger was still creating the row. Fixed by polling
   `refreshProfile()` and rendering a "Setting up your account…" state
   instead of bouncing the user.

---

## 6. Reference: SQL for the hardening migration

See `supabase/migrations/*_security_hardening.sql`.

---

## 7. Cron / webhook authentication

Every route under `/api/public/hooks/*` runs with the service-role key and must
therefore reject anonymous callers. Authentication is enforced by
`requireCronSecret(request)` (`src/lib/server/cron-auth.ts`), which compares
the `x-cron-secret` (or `Authorization: Bearer …`) header against the
`CRON_SECRET` runtime environment variable using a constant-time comparison.

Wiring:

1. `CRON_SECRET` is stored as a runtime secret in Lovable Cloud.
2. The same value is mirrored into Supabase Vault (name `CRON_SECRET`) so
   `pg_cron` jobs can read it via
   `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET'`.
3. Each scheduled `cron.job` row builds its `x-cron-secret` header from the
   Vault lookup at call time — the secret is never written into the
   `cron.job_run_details` history.

Handlers covered: `analyze-sentiment`, `auto-resolve`,
`auto-suggest-markets`, `compute-trends`, `scrape-news`, `scrape-tweets`.

To rotate: update the runtime secret and the Vault entry to the same new
value. No code change required.

## 8. Storage bucket policies

| Bucket | Public read | Owner write | Listing |
|---|---|---|---|
| `avatars` | ✅ via direct public URL | owner only | owner's folder only |
| `kyc-documents` | ❌ | owner only | owner's folder only |

Avatars: the broad bucket-wide SELECT was removed. Files remain accessible by
their public URL (the bucket is `public = true`), but the storage API can no
longer be used to enumerate every avatar in the bucket.

KYC documents: owners can now also UPDATE and DELETE their own files, so a
rejected submission can be replaced.

## 9. SECURITY DEFINER function exposure

EXECUTE on every `public.*` SECURITY DEFINER function has been revoked from
`anon` and `PUBLIC`. It is then re-granted only to the roles that legitimately
need it:

- `authenticated` + `anon`: `get_leaderboard`, `get_user_public_stats`,
  `get_user_public_positions` (read-only aggregates, used on public pages).
- `authenticated` only: trade RPCs (`execute_lmsr_trade_*`,
  `simulate_lmsr_trade`), role checks (`has_role`, `is_admin`),
  `match_news_to_markets`, `check_rate_limit`, and admin RPCs
  (`resolve_market`, `resolve_multi_market`, `seed_lmsr_market(_from_signal)`,
  `rescale_liquidity`, `admin_reset_balance`). Admin RPCs additionally enforce
  `has_role(auth.uid(),'admin')` as their first statement.
- Internal trigger helpers (`handle_new_user`, `auto_seed_*`,
  `guard_profile_sensitive_columns`, etc.) are callable only by `postgres`.
