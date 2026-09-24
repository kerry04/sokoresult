import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/auth/AuthShell";
import { WelcomeTour, tutorialDone } from "@/components/onboarding/WelcomeTour";

export const Route = createFileRoute("/welcome")({
  validateSearch: z.object({
    replay: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Quick tour — SokoResult" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { replay } = Route.useSearch();
  const isReplay = replay === "1";

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    // Returning users who already saw the tour go straight on,
    // unless they explicitly asked to replay it.
    if (!loading && user && !isReplay && tutorialDone()) navigate({ to: "/kyc" });
  }, [loading, user, isReplay, navigate]);

  if (loading || !user) {
    return (
      <AuthShell title="Quick tour" subtitle="One moment…">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Quick tour" subtitle="60 seconds, then you're trading.">
      <WelcomeTour onDone={() => navigate({ to: isReplay ? "/profile" : "/kyc" })} />
    </AuthShell>
  );
}
