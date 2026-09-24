import { supabase } from "@/integrations/supabase/client";

export interface NotificationPrefs {
  payouts: boolean;
  resolutions: boolean;
  trades: boolean;
  price_alerts: boolean;
  marketing: boolean;
}

export interface PriceAlert {
  id: string;
  market_id: string;
  direction: "above" | "below";
  threshold: number;
  triggered: boolean;
  created_at: string;
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<
    string,
    unknown
  >;
  if (!res.ok || body.ok === false) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status}).`,
    );
  }
  return body;
}

/** 503 = the staged migration hasn't been applied yet. Callers show a graceful note. */
export function isNotReady(error: unknown): boolean {
  return error instanceof Error && /not available yet/i.test(error.message);
}

export async function getPreferences(): Promise<NotificationPrefs> {
  const body = await authedFetch("/api/notifications/preferences");
  return body.preferences as NotificationPrefs;
}

export async function savePreferences(patch: Partial<NotificationPrefs>): Promise<void> {
  await authedFetch("/api/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function listAlerts(): Promise<PriceAlert[]> {
  const body = await authedFetch("/api/alerts");
  return (body.alerts ?? []) as PriceAlert[];
}

export async function createAlert(input: {
  market_id: string;
  direction: "above" | "below";
  threshold_pct: number;
}): Promise<{ id: string; note?: string }> {
  const body = await authedFetch("/api/alerts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { id: body.id as string, note: body.note as string | undefined };
}

export async function deleteAlert(id: string): Promise<void> {
  await authedFetch(`/api/alerts/${id}`, { method: "DELETE" });
}
