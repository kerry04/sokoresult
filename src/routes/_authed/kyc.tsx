import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authed/kyc")({
  component: KycPage,
});

function KycPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (!user || !profile) return null;

  const verified = (profile.kyc_tier ?? 0) >= 1;

  const toggle = async () => {
    setSubmitting(true);
    try {
      const rpc = verified ? "set_self_kyc_unverified" : "set_self_kyc_verified";
      const { error } = await (supabase.rpc as any)(rpc);
      if (error) throw error;
      toast.success(verified ? "Marked as unverified" : "You're verified — happy testing!");
      await refreshProfile();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Verification</h1>

      <div
        className={`rounded-2xl border p-6 ${
          verified
            ? "border-success/40 bg-success/10"
            : "border-warning/40 bg-warning/10"
        }`}
      >
        <div className="flex items-center gap-3">
          {verified ? (
            <ShieldCheck className="h-6 w-6 text-success" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-warning" />
          )}
          <div>
            <div className={`font-semibold ${verified ? "text-success" : "text-warning"}`}>
              {verified ? "Verified" : "Unverified"}
            </div>
            <div className="text-sm text-muted-foreground">
              {verified
                ? "Real-money trading unlocked."
                : "Verify your account to start trading."}
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={toggle}
        disabled={submitting}
        className={`w-full h-12 ${
          verified
            ? "bg-warning hover:bg-warning/90 text-warning-foreground"
            : "bg-success hover:bg-success/90 text-success-foreground"
        }`}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating…
          </>
        ) : verified ? (
          "Mark as unverified"
        ) : (
          "Mark as verified"
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Test mode — toggle freely while trying out the trading flow.
      </p>
    </div>
  );
}
