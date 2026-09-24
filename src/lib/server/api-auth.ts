/**
 * Bearer-token auth for /api/* route handlers (server-only).
 *
 * Mirrors the requireSupabaseAuth server-fn middleware but works inside
 * file-route server handlers, where we validate the token explicitly and
 * return plain Response errors instead of throwing.
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface ApiUser {
  user: User;
  /** RLS-scoped client acting as the user. */
  supabase: SupabaseClient;
}

/** Returns the authenticated user, or a 401/500 Response describing the failure. */
export async function requireApiUser(request: Request): Promise<ApiUser | Response> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ ok: false, error: "Server misconfigured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return unauthorized();

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return unauthorized();
  return { user: data.user, supabase };
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "Sign in to continue." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
