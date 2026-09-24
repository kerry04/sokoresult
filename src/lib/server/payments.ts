/**
 * Paystack money rail (server-only).
 *
 * SokoResult's chosen M-Pesa rail. Test mode first: the secret key must start
 * with `sk_test_`. Never import this module from client code — the secret key
 * must never reach the browser.
 *
 * Money rules (from the Paystack operating notes):
 * - Amounts are in the smallest currency unit (KES 500 = 50000).
 * - Direct M-Pesa charges complete offline on the customer's phone (STK push,
 *   ~180s window). The charge succeeds only when the charge.success webhook
 *   arrives or GET /transaction/verify/:reference says success.
 * - Webhooks are verified with HMAC-SHA512 over the RAW request bytes.
 * - Credits are idempotent: the same reference can never credit twice.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

/** Minimum real-money deposit, in KES. Matches the terms page. */
export const MIN_DEPOSIT_KES = 100;
/** Maximum single deposit in test mode, in KES. Keeps fat-finger mistakes small. */
export const MAX_DEPOSIT_KES = 50_000;

/** Test M-Pesa number from the Paystack docs — never charges real money. */
export const PAYSTACK_TEST_MPESA_NUMBER = "+254710000000";

export interface PaystackStatus {
  configured: boolean;
  testMode: boolean;
}

export function paystackStatus(): PaystackStatus {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  return {
    configured: key.length > 0,
    testMode: key.startsWith("sk_test_"),
  };
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured on the server.");
  return key;
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(25_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message ?? `Paystack error ${res.status}`);
  }
  return body!.data as T;
}

/**
 * Normalize a Kenyan phone number to E.164 (+254...).
 * Accepts 0712345678, 254712345678, +254712345678.
 * Returns null when the input is not a plausible Kenyan mobile number.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let e164: string | null = null;
  if (/^0\d{9}$/.test(digits)) e164 = `+254${digits.slice(1)}`;
  else if (/^254\d{9}$/.test(digits)) e164 = `+${digits}`;
  if (!e164) return null;
  // Kenyan mobile prefixes are 01xx and 07xx.
  if (!/^\+254(1|7)\d{8}$/.test(e164)) return null;
  return e164;
}

export interface DepositInit {
  email: string;
  amountKes: number;
  phone: string;
  reference: string;
  userId: string;
}

export interface DepositCharge {
  reference: string;
  status: string;
  message: string | null;
}

/**
 * Start a direct M-Pesa charge (STK push to the customer's phone).
 * The customer has ~180s to enter their M-Pesa PIN. Nothing is credited here —
 * crediting happens only after /transaction/verify reports success or the
 * charge.success webhook arrives and is signature-verified.
 */
export async function initializeMpesaDeposit(input: DepositInit): Promise<DepositCharge> {
  const data = await paystackFetch<{
    reference: string;
    status: string;
    message?: string | null;
  }>("/charge", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountKes * 100), // KES -> cents
      currency: "KES",
      reference: input.reference,
      mobile_money: { phone: input.phone, provider: "mpesa" },
      metadata: { user_id: input.userId, kind: "deposit", source: "sokoresult" },
    }),
  });
  return {
    reference: data.reference,
    status: data.status,
    message: data.message ?? null,
  };
}

export interface VerifiedTransaction {
  reference: string;
  status: string; // "success" | "failed" | "abandoned" | ...
  amountKes: number;
  currency: string;
  userId: string | null;
  paidAt: string | null;
  gatewayResponse: string | null;
}

/** Server-side source of truth for a payment. Never trust the client. */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const data = await paystackFetch<{
    reference: string;
    status: string;
    amount: number;
    currency: string;
    metadata?: Record<string, unknown> | null;
    paid_at?: string | null;
    gateway_response?: string | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    reference: data.reference,
    status: data.status,
    amountKes: Math.round(Number(data.amount ?? 0) / 100),
    currency: data.currency,
    userId: typeof data.metadata?.user_id === "string" ? (data.metadata.user_id as string) : null,
    paidAt: data.paid_at ?? null,
    gatewayResponse: data.gateway_response ?? null,
  };
}

/**
 * Verify a Paystack webhook signature. `raw` must be the exact raw request
 * bytes — never re-serialized JSON.
 */
export function verifyWebhookSignature(raw: Buffer, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const digest = createHmac("sha512", key).update(raw).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Unique, idempotency-safe reference for a new deposit. */
export function newDepositReference(userId: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SOKO-${Date.now().toString(36).toUpperCase()}-${rand}`;
}
