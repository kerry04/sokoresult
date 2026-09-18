import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Sign up — SokoResult" }],
  }),
  component: SignupPage,
});

function SignupPage() {
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
      <AuthForm mode="signup" redirectTo="/onboarding" />
    </AuthShell>
  );
}
