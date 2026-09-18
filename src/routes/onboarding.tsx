import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — SokoResult" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [referral, setReferral] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileWaitMs, setProfileWaitMs] = useState(0);

  // If the auth listener has settled and there's no user, send them to login.
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // The handle_new_user trigger creates a profile row asynchronously.
  // On a brand-new device/account, profile may be null for a beat — keep
  // polling instead of bouncing the user back to a different page.
  useEffect(() => {
    if (!user || profile) return;
    const id = setInterval(() => {
      setProfileWaitMs((ms) => ms + 500);
      refreshProfile();
    }, 500);
    return () => clearInterval(id);
  }, [user, profile, refreshProfile]);

  // Prefill name from existing profile if returning user.
  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
    // Only auto-advance returning users who already finished onboarding.
    if (profile?.onboarded) navigate({ to: "/kyc" });
  }, [profile, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!adult || !terms) {
      toast.error("Please confirm both boxes to continue");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        referred_by: referral.trim() || null,
        onboarded: true,
      })
      .eq("id", user.id);
    setSubmitting(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    await refreshProfile();
    toast.success("Profile saved. Let's verify your ID next.");
    navigate({ to: "/kyc" });
  };

  // Brand-new accounts: profile row is created by a DB trigger right after signup.
  // Show a friendly waiting state instead of a blank/broken form.
  if (user && !profile) {
    return (
      <AuthShell title="Setting up your account…" subtitle="This only takes a moment.">
        <div className="text-sm text-muted-foreground">
          {profileWaitMs > 6000
            ? "Still working on it… if this takes more than a few seconds, refresh the page."
            : "Preparing your trader profile."}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="One last thing"
      subtitle="Set up your trader profile."
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            required
            minLength={2}
            maxLength={32}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. NairobiTrader"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="ref">Referral code <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="ref"
            value={referral}
            onChange={(e) => setReferral(e.target.value.toUpperCase())}
            maxLength={12}
            className="mt-1.5 h-11 font-mono uppercase"
          />
        </div>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={adult} onCheckedChange={(v) => setAdult(!!v)} className="mt-0.5" />
          <span>I confirm I am 18 years or older.</span>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
          <span>I accept the Terms of Service and trade responsibly.</span>
        </label>
        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 bg-gradient-primary shadow-glow"
        >
          Enter the markets
        </Button>
      </form>
    </AuthShell>
  );
}
