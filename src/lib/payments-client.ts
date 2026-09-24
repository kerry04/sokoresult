/**
 * Browser client for the real-money payment endpoints (/api/payments/*).
 *
 * The Bearer <redacted> is attached manually here (file-route handlers don't go
 * through the serverFn auth middleware). Nothing here touches secret keys —
 * those stay on the server.
 */
import { supabase } from "@/integrations/supabase/client";

async function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export interface PaymentStatus {
  ok: boolean;
  configured: boolean;
  testMode: boolean;
  minDepositKes: number;
  maxDepositKes: number;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  kycRequired: boolean;
}

export async function getPaymentStatus(): Promise<PaymentStatus | null> {
  try {
    const { body } = await authedFetch("/api/payments/status");
    return body as PaymentStatus;
  } catch {
    return null;
  }
}

export interface DepositStart {
  ok: boolean;
  reference?: string;
  status?: string;
  message?: string | null;
  testMode?: boolean;
  hint?: string;
  error?: string;
  kycRequired?: boolean;
}

export async function startDeposit(amountKes: number, phone: string): Promise<DepositStart> {
  const { body } = await authedFetch("/api/payments/deposit", {
    method: "POST",
    body: JSON.stringify({ amountKes, phone }),
  });
  return (body ?? { ok: false, error: "Network error. Try again." }) as DepositStart;
}

export interface DepositVerify {
  ok: boolean;
  credited?: boolean;
  already?: boolean;
  status?: string;
  amountKes?: number;
  error?: string;
}

export async function verifyDeposit(reference: string): Promise<DepositVerify> {
  const { body } = await authedFetch("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
  return (body ?? { ok: false, error: "Network error. Try again." }) as DepositVerify;
}
