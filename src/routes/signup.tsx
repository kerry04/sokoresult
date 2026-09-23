import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  validateSearch: z.object({
    redirect: z.string().optional().default("/onboarding"),
  }),
  head: () => ({
    meta: [{ title: "Sign up — SokoResult" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const safeTarget = safeRedirect(redirectTo, "/onboarding");
  return (
    <AuthShell
      title="Create account"
      subtitle="Get KES 10,000 demo balance. No card required."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-success hover:underline font-medium">
            Log in
          </Link>
        </>
      }
    >
      <AuthForm mode="signup" redirectTo={safeTarget} />
    </AuthShell>
  );
}
