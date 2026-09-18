// Lightweight device fingerprint — no external dependency.
// Stable across sessions for the same browser+device, stored in localStorage.
import { supabase } from "@/integrations/supabase/client";

const KEY = "sr_fp_v1";

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function getFingerprint(): string {
  try {
    const cached = localStorage.getItem(KEY);
    if (cached) return cached;
    const parts = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency ?? 0,
      (navigator as any).deviceMemory ?? 0,
    ].join("|");
    const fp = hash(parts) + "-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(KEY, fp);
    return fp;
  } catch {
    return "unknown-" + Math.random().toString(36).slice(2, 10);
  }
}

let recorded = false;
export async function recordSessionOnce(): Promise<void> {
  if (recorded) return;
  recorded = true;
  try {
    const fp = getFingerprint();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    await (supabase.rpc as any)("record_session", { _fingerprint: fp, _user_agent: ua });
  } catch {
    // best-effort, ignore failures
  }
}
