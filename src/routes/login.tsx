import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional().default("/markets"),
  }),
  head: () => ({
    meta: [{ title: "Sign in — SokoResult" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const safeTarget = safeRedirect(redirectTo);
  return (
    <AuthShell
      title="Log in"
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="text-success hover:underline font-medium">
            Create one
          </Link>
        </>
      }
    >
      <AuthForm mode="login" redirectTo={safeTarget} />
    </AuthShell>
  );
}
