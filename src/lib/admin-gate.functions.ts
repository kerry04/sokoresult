import { createServerFn } from "@tanstack/react-start";

/**
 * Whether the admin surface is enabled for this deployment.
 *
 * The public site builds WITHOUT ADMIN_ENABLED, so every /admin/* route
 * 404s there. The dedicated admin Vercel project sets ADMIN_ENABLED=true.
 * This is attack-surface reduction, not the security boundary — the real
 * lock remains the is_current_user_admin() role check in AdminLayout.
 */
export const getAdminEnabled = createServerFn({ method: "GET" }).handler(
  async () => process.env.ADMIN_ENABLED === "true",
);
