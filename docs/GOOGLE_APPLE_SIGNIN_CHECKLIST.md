# Google / Apple sign-in — dashboard checklist

The app code is complete and verified in-repo (2026-09-24):

- `src/integrations/firebase/client.ts` — Firebase popup with redirect fallback,
  `GoogleAuthProvider` and `OAuthProvider("apple.com")`.
- `src/components/auth/AuthForm.tsx` — exchanges the Firebase ID token for a
  Supabase session via `signInWithIdToken({ provider: "firebase" })`; popup and
  redirect flows both handled; every known failure code maps to a plain-language
  toast in `src/lib/errors.ts`.
- `supabase/config.toml` — `[auth.third_party.firebase]` enabled with
  `project_id = "sokoresult-5ab34"`.

Every remaining failure mode lives in dashboards, not in this repo. If a button
fails, the toast tells you which checkbox below to fix:

| Toast you see | Fix |
|---|---|
| "This sign-in method isn't enabled yet" (`auth/operation-not-allowed`) | Firebase console → Authentication → Sign-in method → enable **Google** (and **Apple** with a Services ID + key from the Apple Developer portal). |
| "This site's domain isn't authorized" (`auth/unauthorized-domain`) | Firebase console → Authentication → Settings → **Authorized domains** → add `sokoresult.com` and `www.sokoresult.com`. This is the most likely failure right after the DNS cutover. |
| "Google sign-in isn't authorized for this site's domain" (`auth/requests-from-referer`) | Google Cloud console → Credentials → the Firebase API key → **HTTP referrers** → allow `https://sokoresult.com/*` and `https://www.sokoresult.com/*`. |
| "Social sign-in isn't switched on for this project yet" | Supabase dashboard → Authentication → Providers → enable the **Firebase** third-party provider with project ID `sokoresult-5ab34`. Note: `config.toml` only covers the local CLI — the live project needs this in the dashboard. |
| "The sign-in token was rejected by the server" | The Firebase project ID in Supabase doesn't match the token's issuer, or the provider was just enabled and needs a minute. Re-check the project ID above. |

Apple-specific: the Services ID in the Apple Developer portal must list the
return URL `https://sokoresult-5ab34.firebaseapp.com/__/auth/handler`.

Nothing here needs a code change — walk the table top to bottom, clicking each
button after every fix, and stop at the first one that works.
