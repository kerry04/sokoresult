/**
 * Demo-mode auth — local email/password auth with scrypt hashing and
 * HMAC-signed session tokens. Mirrors the Supabase trigger behaviour:
 * signup creates a profile seeded with KES 10,000; the FIRST registered
 * user becomes admin. Demo grants kyc_tier 1 so trading is frictionless.
 */
import * as crypto from "node:crypto";
import { dbGet, dbPut, ensureStore, scheduleSave } from "./store";

export interface SessionUser {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
  aud: string;
  role: string;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  display_name: string | null;
  created_at: string;
}

const scrypt = (pw: string, salt: string) =>
  crypto.scryptSync(pw, salt, 32).toString("hex");

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function makeToken(userId: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token: string, secret: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (sign(payload, secret) !== sig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.sub || Date.now() > data.exp) return null;
    return data.sub as string;
  } catch {
    return null;
  }
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    user_metadata: { display_name: row.display_name, email: row.email },
    app_metadata: { provider: "email" },
    aud: "authenticated",
    role: "authenticated",
    created_at: row.created_at,
  };
}

export function publicUserFromToken(token: string | null | undefined): SessionUser | null {
  if (!token) return null;
  const secret = ensureStoreSync().meta.secret;
  const userId = verifyToken(token, secret);
  if (!userId) return null;
  const row = dbGet("users").find((u: UserRow) => u.id === userId) as UserRow | undefined;
  return row ? toSessionUser(row) : null;
}

// ensureStore is async; provide a sync access after first use
import type { DemoDB } from "./store";
let _store: DemoDB | null = null;
export async function initDemoAuth(): Promise<DemoDB> {
  _store = await ensureStore();
  return _store;
}
function ensureStoreSync(): DemoDB {
  if (!_store) throw new Error("Demo auth not initialized");
  return _store;
}

export interface AuthResult {
  user: SessionUser | null;
  access_token: string | null;
  error: string | null;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  await initDemoAuth();
  const users = dbGet("users");
  const norm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) return { user: null, access_token: null, error: "Enter a valid email" };
  if (password.length < 8) return { user: null, access_token: null, error: "Password must be at least 8 characters" };
  if (users.some((u: UserRow) => u.email === norm)) {
    return { user: null, access_token: null, error: "An account with this email already exists" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const row: UserRow = {
    id: crypto.randomUUID(),
    email: norm,
    password_hash: scrypt(password, salt),
    salt,
    display_name: norm.split("@")[0].slice(0, 24),
    created_at: new Date().toISOString(),
  };
  users.push(row);
  dbPut("users", users);

  // Mirror handle_new_user trigger: profile + KES 10,000 (demo: kyc_tier 1)
  const profiles = dbGet("profiles");
  profiles.push({
    id: row.id,
    display_name: row.display_name,
    avatar_url: null,
    kes_balance: 1_000_000, // KES 10,000
    oko_balance: 100,
    kyc_tier: 1,
    onboarded: false,
    referral_code: `SR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    phone: null,
    current_streak: 0,
    longest_streak: 0,
    last_trade_date: null,
    sound_enabled: true,
    country: null,
    status: "active",
    flag_reason: null,
    referred_by: null,
    created_at: row.created_at,
    updated_at: row.created_at,
  });
  dbPut("profiles", profiles);
  const pp = dbGet("profiles_public");
  pp.push({ id: row.id, display_name: row.display_name, avatar_url: null });
  dbPut("profiles_public", pp);

  // Transactions: welcome bonus
  const txns = dbGet("transactions");
  txns.push({
    id: crypto.randomUUID(),
    user_id: row.id,
    type: "signup_bonus",
    amount_cents: 1_000_000,
    description: "Welcome bonus — KES 10,000 demo cash",
    created_at: row.created_at,
  });
  dbPut("transactions", txns);

  // First real user becomes admin
  const roles = dbGet("user_roles");
  if (!roles.some((r: any) => r.role === "admin")) {
    roles.push({ user_id: row.id, role: "admin", created_at: row.created_at });
    dbPut("user_roles", roles);
  }

  const secret2 = ensureStoreSync().meta.secret;
  scheduleSave();
  return { user: toSessionUser(row), access_token: makeToken(row.id, secret2), error: null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  await initDemoAuth();
  const norm = email.trim().toLowerCase();
  const row = dbGet("users").find((u: UserRow) => u.email === norm) as UserRow | undefined;
  if (!row) return { user: null, access_token: null, error: "Invalid login credentials" };
  const attempt = scrypt(password, row.salt);
  const ok =
    attempt.length === row.password_hash.length &&
    crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(row.password_hash));
  if (!ok) return { user: null, access_token: null, error: "Invalid login credentials" };
  const secret = ensureStoreSync().meta.secret;
  return { user: toSessionUser(row), access_token: makeToken(row.id, secret), error: null };
}
