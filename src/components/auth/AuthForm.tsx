import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useNavigate, Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { safeRedirect } from "@/lib/utils";

interface Props {
  mode: "login" | "signup";
  redirectTo: string;
}

export function AuthForm({ mode, redirectTo }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const target = safeRedirect(redirectTo, mode === "signup" ? "/onboarding" : "/markets");

  // After auth completes, wait for the session to actually exist on this
  // device before navigating — otherwise the protected route guard sees a
  // null user and bounces back to the landing page.
  const waitForSession = async (timeoutMs = 4000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please accept the Terms & Conditions to continue");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;
        // If email confirmation is required, the session won't be established here.
        const ok = await waitForSession(2000);
        if (ok) {
          toast.success("Account created");
          navigate({ to: "/onboarding" });
        } else {
          toast.success("Account created! Check your email to confirm, then log in.");
          navigate({ to: "/login" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await waitForSession();
        toast.success("Welcome back");
        navigate({ to: target });
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please accept the Terms & Conditions to continue");
      return;
    }
    setLoading(true);
    try {
      // Always send OAuth users back to a real in-app destination, never the landing page.
      const oauthReturn =
        mode === "signup"
          ? `${window.location.origin}/onboarding`
          : `${window.location.origin}${target}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: oauthReturn },
      });
      if (error) throw error;
      await waitForSession();
      navigate({ to: mode === "signup" ? "/onboarding" : target });
    } catch (err) {
      toast.error(friendlyError(err));
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    setLoading(true);
    try {
      const fullPhone = `+254${phone.replace(/^0/, "")}`;
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) throw error;
      setOtpSent(true);
      toast.success("Code sent. Check your SMS.");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const fullPhone = `+254${phone.replace(/^0/, "")}`;
      const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: "sms" });
      if (error) throw error;
      await waitForSession();
      toast.success("Signed in");
      navigate({ to: mode === "signup" ? "/onboarding" : target });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Google */}
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loading}
        className="w-full h-12 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/60 flex items-center justify-center gap-3 text-sm font-medium transition-colors disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.91 3.41 14.7 2.4 12 2.4 6.76 2.4 2.5 6.66 2.5 12s4.26 9.6 9.5 9.6c5.49 0 9.12-3.86 9.12-9.29 0-.62-.07-1.1-.16-1.61H12z"/>
        </svg>
        Continue with Google
      </button>

      {/* Apple */}
      <button
        type="button"
        onClick={() => handleOAuth("apple")}
        disabled={loading}
        className="w-full h-12 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/60 flex items-center justify-center gap-3 text-sm font-medium transition-colors disabled:opacity-60"
      >
        <svg className="h-5 w-5 -mt-0.5" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.6 105.5c30-35.6 27.3-68 26.4-79.5-26.5 1.5-57.2 18-74.7 38.3-19.3 21.8-30.6 48.7-28.2 79 28.7 2.2 54.9-12.6 76.5-37.8z"/>
        </svg>
        Continue with Apple
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      <Tabs defaultValue="email">
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-secondary/40 p-1 h-10">
          <TabsTrigger value="email" className="rounded-lg">Email</TabsTrigger>
          <TabsTrigger value="phone" className="rounded-lg">Phone</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-4">
          <form onSubmit={handleEmail} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-secondary/40 border-border/50 px-4"
            />
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl bg-secondary/40 border-border/50 px-4 pr-11"
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

            {mode === "signup" ? (
              <label className="flex items-start gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  I am 18+ and accept the{" "}
                  <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
                    Terms &amp; Conditions
                  </Link>.
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">
                By continuing, you agree to SokoResult's{" "}
                <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>.
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold text-base"
            >
              {mode === "signup" ? "Create account" : "Log in"}
            </Button>

            {mode === "login" && (
              <div className="text-center">
                <Link to="/login" className="text-sm font-medium text-success hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}
          </form>
        </TabsContent>

        <TabsContent value="phone" className="mt-4 space-y-3">
          {!otpSent ? (
            <>
              <div className="flex gap-2">
                <div className="flex h-12 items-center rounded-xl border border-border/50 bg-secondary/40 px-3 text-sm font-mono">
                  🇰🇪 +254
                </div>
                <Input
                  type="tel"
                  placeholder="712 345 678"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 h-12 rounded-xl bg-secondary/40 border-border/50 px-4"
                />
              </div>
              <Button
                onClick={sendOtp}
                disabled={loading || phone.length < 9}
                className="w-full h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold"
              >
                Send code
              </Button>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-10 text-base" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold"
              >
                Verify
              </Button>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Use a different number
              </button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
