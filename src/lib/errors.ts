// Centralized friendly error mapping. Raw DB / network / auth errors should
// never reach end users — they may leak schema names or internals. Always log
// the original to the console for debugging, and surface a short message.

interface MaybeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

const PATTERNS: Array<{ test: (msg: string, code?: string) => boolean; out: string }> = [
  // Firebase auth errors (messages look like "Firebase: Error (auth/xxx).")
  {
    test: (m) =>
      /auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found|auth\/invalid-email/i.test(
        m,
      ),
    out: "Wrong email or password.",
  },
  {
    test: (m) => /auth\/email-already-in-use|auth\/credential-already-in-use/i.test(m),
    out: "An account with that email already exists.",
  },
  { test: (m) => /auth\/weak-password/i.test(m), out: "Password must be at least 8 characters." },
  {
    test: (m) => /auth\/popup-closed-by-user|auth\/cancelled-popup-request/i.test(m),
    out: "Sign-in cancelled.",
  },
  {
    test: (m) => /auth\/popup-blocked/i.test(m),
    out: "Your browser blocked the sign-in window. Allow popups and try again.",
  },
  {
    test: (m) => /auth\/account-exists-with-different-credential/i.test(m),
    out: "An account with this email already uses a different sign-in method. Log in with email and password.",
  },
  {
    test: (m) => /auth\/operation-not-allowed/i.test(m),
    out: "This sign-in method isn't enabled yet. Use email and password, or contact support.",
  },
  {
    test: (m) => /auth\/unauthorized-domain/i.test(m),
    out: "This site's domain isn't authorized for sign-in yet. Please contact support.",
  },
  {
    test: (m) => /auth\/requests-from-referer/i.test(m),
    out: "Google sign-in isn't authorized for this site's domain yet. Please contact support.",
  },
  // Supabase token-exchange failures: the Firebase popup worked, but the
  // server rejected the token. These need dashboard fixes, not retries.
  {
    test: (m) => /provider.*not enabled|third.?party.*not enabled|signup.*disabled/i.test(m),
    out: "Social sign-in isn't switched on for this project yet. Use email and password for now.",
  },
  {
    test: (m) => /unable to validate|failed to validate|invalid id token/i.test(m),
    out: "The sign-in token was rejected by the server. Use email and password for now, or contact support.",
  },
  {
    test: (m) => /auth\/user-disabled/i.test(m),
    out: "This account has been disabled. Contact support.",
  },
  { test: (m) => /invalid login credentials/i.test(m), out: "Wrong email or password." },
  { test: (m) => /email not confirmed/i.test(m), out: "Please confirm your email first." },
  {
    test: (m) => /user already registered|already exists/i.test(m),
    out: "An account with that email already exists.",
  },
  {
    test: (m) => /password.*should be at least|password.*too short/i.test(m),
    out: "Password must be at least 8 characters.",
  },
  {
    test: (m) => /pwned|leaked password/i.test(m),
    out: "That password has been exposed in a data breach. Choose a different one.",
  },
  {
    test: (m) => /jwt expired|invalid jwt|not authenticated/i.test(m),
    out: "Your session expired. Please sign in again.",
  },
  {
    test: (m) => /rate limit|too many/i.test(m),
    out: "Too many attempts. Please wait a moment and try again.",
  },
  {
    test: (m) => /row-level security|permission denied|not authorized/i.test(m),
    out: "You don't have permission to do that.",
  },
  {
    test: (m) =>
      /balance can only be changed|kyc tier can only be changed|referral code is immutable|cannot change profile id/i.test(
        m,
      ),
    out: "That field can't be edited.",
  },
  {
    test: (m) => /KYC_REQUIRED/i.test(m),
    out: "Verification required to trade. Please complete account verification.",
  },
  { test: (m) => /insufficient balance/i.test(m), out: "Not enough balance for this trade." },
  { test: (m) => /insufficient shares/i.test(m), out: "You don't hold enough shares to sell." },
  {
    test: (m) => /position cap/i.test(m),
    out: "You've hit the per-market position cap. Try a smaller bet or pick another market.",
  },
  {
    test: (m) => /LONGSHOT_BLOCKED/i.test(m),
    out: "This bet is too long-shot to place — pick a more realistic outcome.",
  },
  { test: (m) => /HOURLY_CAP/i.test(m), out: "Hourly trading limit reached. Try again in a bit." },
  {
    test: (m) => /NOTIONAL_CAP/i.test(m),
    out: "You've reached the cap for this market. Try a smaller bet.",
  },
  {
    test: (m) => /MARKET_CAP/i.test(m),
    out: "This market is at its 24h volume cap. Try again later.",
  },
  {
    test: (m) => /ACCOUNT_RESTRICTED/i.test(m),
    out: "Your account is restricted. Contact support.",
  },
  {
    test: (m) => /market is not open|market not found/i.test(m),
    out: "This market is no longer open.",
  },
  {
    test: (m) => /must be at least 18/i.test(m),
    out: "You must be 18 or older to verify your account.",
  },
  {
    test: (m) => /sokoresult\.com.*reserved/i.test(m),
    out: "That email domain is reserved for staff.",
  },
  { test: (m) => /duplicate key|unique constraint/i.test(m), out: "That value is already taken." },
  {
    test: (m) => /failed to fetch|network|timeout/i.test(m),
    out: "Network problem. Check your connection and try again.",
  },
  { test: (_m, code) => code === "PGRST301", out: "You don't have permission to do that." },
];

export function friendlyError(err: unknown): string {
  // Always log the raw error for developers
  if (err) console.error("[app error]", err);

  const e = (err ?? {}) as MaybeError;
  const raw = (e.message ?? String(err ?? "")).trim();
  if (!raw) return "Something went wrong. Please try again.";

  for (const p of PATTERNS) {
    if (p.test(raw, e.code)) return p.out;
  }

  // Fallback — never expose raw DB errors. Strip anything that looks like a
  // postgres detail (table.column references, hex IDs, SQL keywords).
  if (/relation |column |constraint |pg_|psql|sql state/i.test(raw)) {
    return "Something went wrong. Please try again.";
  }
  // Short, user-grade messages can pass through.
  if (raw.length < 120 && !/[{}<>]/.test(raw)) return raw;
  return "Something went wrong. Please try again.";
}
