import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort insert into admin_alerts for pipeline-stage failures.
 * Never throws — alerting must never break the pipeline.
 */
export async function logPipelineFailure(
  admin: SupabaseClient,
  stage: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("admin_alerts").insert({
      kind: "pipeline_failure",
      severity: "warn",
      payload: { stage, error: message, ...(extra ?? {}) },
    });
  } catch {
    // swallow — alerting must not propagate
  }
}
