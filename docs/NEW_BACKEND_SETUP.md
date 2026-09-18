# New Backend Setup — De-Lovebled SokoResult

The app no longer depends on Lovable. This is the walkthrough for standing it
up on **your own Supabase project** with fresh data.

**Removed:** `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config`,
`.lovable/`, `src/integrations/lovable/`, `previewAuthStorage.ts`, the Lovable
AI Gateway (was already unused — `lib/server/gemini.ts` calls Google directly),
and all `pg_cron` jobs that POSTed to dead `*.lovable.app` hosts
(see `supabase/migrations/20260918120000_delovable_drop_lovable_cron.sql`).

**Verified working:** `tsc --noEmit` clean, `npm run dev` serves the app,
`npm run build` produces the Cloudflare Worker bundle.

---

## 1. Create the Supabase project (~5 min)

1. Sign up / log in at <https://supabase.com> → **New project**.
2. Pick any region (suggestion: `eu-central-1`) and a strong DB password
   (you won't need it often — save it anyway).
3. When it's ready, gather from **Project Settings → API**:
   - `Project URL` (e.g. `https://abcdefgh.supabase.co`)
   - `anon` / `publishable` key
   - `service_role` key (**secret** — server only, bypasses RLS)
   - Project ref (the 20-char slug in the URL)

## 2. Wire the environment

```bash
cp .env.example .env
# fill in SUPABASE_URL / VITE_SUPABASE_URL, the two publishable keys,
# the service_role key, and SUPABASE_PROJECT_ID / VITE_SUPABASE_PROJECT_ID
```

`.env` is gitignored — never commit it. Optional extras (not required for
trading to work): `GEMINI_API_KEY` (free at aistudio.google.com/apikey),
`APIFY_API_TOKEN`, `CRON_SECRET` (any long random string).

## 3. Apply the schema (45 migrations, in order)

Two options:

- **SQL editor (no CLI needed):** run `./supabase/apply_all.sh`, which writes
  `supabase/apply_all.sql` (all 45 migrations concatenated in timestamp
  order). Paste it into Supabase Dashboard → SQL Editor → Run.
- **psql:** `psql "<Settings > Database > Connection string (URI)>" -f supabase/apply_all.sql`

This creates every table, RLS policy, trigger (auto-seed LMSR, profile
creation with KES 10,000, KYC flow), storage buckets (`avatars`,
`kyc-documents`), and RPCs (`execute_lmsr_trade_*`, `get_leaderboard`, …).

## 4. Dashboard settings

- **Auth → Providers → Email:** turn **off** "Confirm email" for local dev.
- **Auth → URL Configuration:** add `http://localhost:5173` to Redirect URLs.
- **Google OAuth (optional):** create an OAuth client at
  <https://console.cloud.google.com/apis/credentials> (web app; authorized
  redirect URI `https://<your-ref>.supabase.co/auth/v1/callback`), then paste
  the client ID/secret into Auth → Providers → Google. (Lovable used to
  broker its own; that's gone.)
- **Phone/SMS login:** needs a Twilio verify config — skip for now.
- **Realtime:** the migrations already added `trades`, `notifications`,
  `admin_alerts` to the `supabase_realtime` publication.

## 5. Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

## 6. First user + admin (in that order)

1. Sign up at `/signup` with a normal personal email.
2. Get your user id: Dashboard → Authentication → Users → copy your UUID.
3. In the SQL editor:
   ```sql
   -- staff email isn't required, but keep the reserved domain out of public signups
   insert into public.user_roles (user_id, role) values ('<your-uuid>', 'admin');
   ```
4. Log in at `/admin` → create markets at `/admin/markets/create`
   (LMSR auto-seeds via trigger) → trade at `/markets`.

> The `block_public_sokoresult_signup` trigger only stops *public* signups
> claiming `@sokoresult.com`; dashboard-created users are service-role inserts
> and pass. To create staff, invite the user from Auth → Users first, then run
> the `user_roles` insert above with that email's UUID.

## 7. Deploying later

`wrangler.jsonc` + the Cloudflare vite plugin are wired — after `npm run
build`, `npx wrangler deploy` publishes the Worker once you've linked a
Cloudflare account. Remember to set the same env vars as secrets in the
Worker config, and re-add `pg_cron` jobs pointing at your new public domain.

## 8. Where things live now

| Concern | Location |
|---|---|
| Vite/build config | `vite.config.ts` (hand-rolled, no wrapper) |
| Browser Supabase client | `src/integrations/supabase/client.ts` |
| Server admin client | `src/integrations/supabase/client.server.ts` |
| Server route auth | `src/integrations/supabase/auth-middleware.ts` |
| Cron hook auth | `src/lib/server/cron-auth.ts` (uses `CRON_SECRET`) |
| Gemini client | `src/lib/server/gemini.ts` (direct Google API) |
| Env template | `.env.example` |
