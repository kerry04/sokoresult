// Shared cron-secret authenticator for /api/public/hooks/* routes.
// All scheduled webhooks must call requireCronSecret(request) before doing
// any DB or paid-API work. Returns null if authorized, a Response if not.

export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Misconfiguration — never run without a secret in production.
    return new Response(
      JSON.stringify({ error: "CRON_SECRET not configured on server" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  // Constant-time-ish compare
  if (provided.length !== expected.length) {
    return unauthorized();
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return unauthorized();
  return null;
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}
