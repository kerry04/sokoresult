import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, Eye, EyeOff, Lock } from "lucide-react";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith("@sokoresult.com")) {
      toast.error("Admin access requires a @sokoresult.com email");
      return;
    }
    setLoading(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Verify admin role server-side via has_role
      const uid = signInData.user?.id;
      if (!uid) throw new Error("No user");

      const { data: roles, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin");

      if (roleErr) throw roleErr;
      if (!roles || roles.length === 0) {
        await supabase.auth.signOut();
        toast.error("This account is not authorised for admin access");
        return;
      }

      toast.success("Welcome, admin");
      navigate({ to: "/admin/markets" });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0A0A14] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(220,38,38,0.15),_transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a2e_1px,transparent_1px),linear-gradient(to_bottom,#1a1a2e_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-destructive/15 border border-destructive/40 flex items-center justify-center mb-3">
            <Shield className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Restricted area · staff only
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-destructive/30 bg-card/90 backdrop-blur p-6 shadow-2xl space-y-4"
        >
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Staff email
            </label>
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@sokoresult.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 mt-1.5 rounded-xl bg-secondary/40 border-border/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <div className="relative mt-1.5">
              <Input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl bg-secondary/40 border-border/50 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
          >
            {loading ? "Verifying…" : "Access admin"}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            All access attempts are logged. Unauthorised use is prohibited.
          </p>
        </form>
      </div>
    </div>
  );
}
