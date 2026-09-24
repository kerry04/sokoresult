import { createFileRoute, Link } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Camera,
  Copy,
  Share2,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Loader2,
  Save,
  Mail,
  BookOpen,
  LifeBuoy,
  ChevronRight,
  Volume2,
  VolumeX,
  Flame,
  Trophy,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AvatarCropDialog } from "@/components/profile/AvatarCropDialog";
import { Switch } from "@/components/ui/switch";
import * as Icons from "lucide-react";

export const Route = createFileRoute("/_authed/profile")({
  component: ProfilePage,
});

const COUNTRIES = [
  { code: "KE", name: "Kenya 🇰🇪" },
  { code: "UG", name: "Uganda 🇺🇬" },
  { code: "TZ", name: "Tanzania 🇹🇿" },
  { code: "RW", name: "Rwanda 🇷🇼" },
  { code: "NG", name: "Nigeria 🇳🇬" },
  { code: "ZA", name: "South Africa 🇿🇦" },
  { code: "OTHER", name: "Other" },
];

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Name must be 2+ characters").max(40),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "Use format +2547XXXXXXXX")
    .or(z.literal("")),
  country: z.string().min(2).max(10),
});

function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("KE");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setPhone(profile.phone ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- profile row type predates generated types
    setCountry((profile as any).country ?? "KE");
  }, [profile]);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!profile?.referral_code) return;
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", profile.referral_code)
      .then(({ count }) => setReferralCount(count ?? 0));
  }, [profile?.referral_code]);

  if (!user || !profile) return null;

  const initials = (profile.display_name ?? user.email ?? "?").slice(0, 2).toUpperCase();
  const avatarUrl = profile.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined);
  const verified = (profile.kyc_tier ?? 0) >= 1;

  const save = async () => {
    const parsed = profileSchema.safeParse({ display_name: name, phone, country });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: parsed.data.display_name,
          phone: parsed.data.phone || null,
          country: parsed.data.country,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy achievements join shape
        } as any)
        .eq("id", user.id);
      if (error) {
        toast.error(friendlyError(error));
        return;
      }

      if (email && email !== user.email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email });
        if (emailErr) {
          toast.error(emailErr.message);
          return;
        }
        toast.success("Check your inbox to confirm the new email");
      }
      toast.success("Profile saved");
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  };

  const handlePickFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const uploadCropped = async (blob: Blob) => {
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/png" });
      if (upErr) {
        toast.error(friendlyError(upErr));
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (updErr) toast.error(friendlyError(updErr));
      else {
        toast.success("Photo updated");
        refreshProfile();
      }
    } finally {
      setUploading(false);
    }
  };

  const copyReferral = async () => {
    if (!profile.referral_code) return;
    await navigator.clipboard.writeText(profile.referral_code);
    toast.success("Referral code copied");
  };

  const shareReferral = async () => {
    const url = `${window.location.origin}/signup?ref=${profile.referral_code ?? ""}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join SokoResult",
          text: "Trade Kenyan prediction markets",
          url,
        });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Profile & settings</h1>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
        <div className="relative">
          <Avatar className="h-20 w-20 ring-2 ring-primary/40">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-mono text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 disabled:opacity-60"
            aria-label="Change photo"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePickFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-sm text-muted-foreground truncate">{user.email}</div>
          <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
            {verified ? (
              <Badge className="bg-success/15 text-success border border-success/40 font-mono text-[10px]">
                <ShieldCheck className="h-3 w-3 mr-1" /> Verified
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning font-mono text-[10px]"
              >
                <ShieldAlert className="h-3 w-3 mr-1" /> Unverified ·{" "}
                <Link to="/kyc" className="underline ml-1">
                  Verify →
                </Link>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Account details */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Account details</h2>
          <p className="text-xs text-muted-foreground">Update your personal information.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">
              <Mail className="h-3 w-3 inline mr-1" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Changes require email confirmation.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="+254712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Verification status</Label>
            <div className="text-sm">
              {verified ? (
                <span className="text-success">✓ Tier {profile.kyc_tier} verified</span>
              ) : (
                <span className="text-warning">
                  Unverified —{" "}
                  <Link to="/kyc" className="underline">
                    Start KYC →
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save changes
          </Button>
        </div>
      </div>

      {/* Referral */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wider">
              Your referral code
            </div>
            <div className="font-mono text-2xl font-bold mt-1">{profile.referral_code ?? "—"}</div>
            <div className="text-sm text-muted-foreground mt-1">{referralCount} referred</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyReferral}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button size="sm" onClick={shareReferral}>
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
          </div>
        </div>
      </div>

      {/* Streak & Sound */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-orange-500/15 border border-orange-500/40 flex items-center justify-center">
            <Flame className="h-6 w-6 text-orange-400 fill-orange-500/40" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Trading streak
            </div>
            <div className="font-mono text-2xl font-bold">{profile.current_streak}</div>
            <div className="text-[11px] text-muted-foreground">
              Best: {profile.longest_streak} days
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
          {profile.sound_enabled ? (
            <Volume2 className="h-6 w-6 text-primary" />
          ) : (
            <VolumeX className="h-6 w-6 text-muted-foreground" />
          )}
          <div className="flex-1">
            <div className="text-sm font-semibold">Sound effects</div>
            <div className="text-[11px] text-muted-foreground">Trade & achievement sounds</div>
          </div>
          <Switch
            checked={profile.sound_enabled}
            onCheckedChange={async (v) => {
              await supabase.from("profiles").update({ sound_enabled: v }).eq("id", user.id);
              await refreshProfile();
            }}
          />
        </div>
      </div>

      <AchievementsCard userId={user.id} />

      {/* More */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">More</h2>
          <p className="text-xs text-muted-foreground">Resources and help.</p>
        </div>
        <Link
          to="/learn"
          className="flex items-center gap-3 px-5 sm:px-6 py-4 min-h-12 hover:bg-accent/40 active:bg-accent/60 transition border-b border-border"
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-medium">Learn</div>
            <div className="text-xs text-muted-foreground">How prediction markets work</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/welcome"
          search={{ replay: "1" }}
          className="flex items-center gap-3 px-5 sm:px-6 py-4 min-h-12 hover:bg-accent/40 active:bg-accent/60 transition border-b border-border"
        >
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-medium">Replay the quick tour</div>
            <div className="text-xs text-muted-foreground">The 60-second walkthrough, anytime</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/support"
          className="flex items-center gap-3 px-5 sm:px-6 py-4 min-h-12 hover:bg-accent/40 active:bg-accent/60 transition"
        >
          <LifeBuoy className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-medium">Support</div>
            <div className="text-xs text-muted-foreground">Get help from our team</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Sign out */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setSignOutOpen(true)}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>You'll need to sign in again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignOutOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => signOut().then(() => (window.location.href = "/"))}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AvatarCropDialog
        file={pendingFile}
        open={cropOpen}
        onOpenChange={(v) => {
          setCropOpen(v);
          if (!v) setPendingFile(null);
        }}
        onCropped={uploadCropped}
      />
    </div>
  );
}

interface AchievementRow {
  code: string;
  unlocked_at: string;
  achievements: {
    code: string;
    title: string;
    description: string;
    icon: string;
    tier: string;
  } | null;
}

function AchievementsCard({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: ua }, { count }] = await Promise.all([
        supabase
          .from("user_achievements")
          .select("code, unlocked_at, achievements(code, title, description, icon, tier)")
          .eq("user_id", userId)
          .order("unlocked_at", { ascending: false }),
        supabase.from("achievements").select("code", { count: "exact", head: true }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy achievements join shape
      setRows((ua ?? []) as any);
      setTotal(count ?? 0);
    })();
  }, [userId]);

  const TIER_COLOR: Record<string, string> = {
    bronze: "from-orange-700 to-orange-500",
    silver: "from-slate-400 to-slate-200",
    gold: "from-yellow-500 to-amber-300",
    platinum: "from-cyan-300 to-violet-400",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" /> Achievements
        </h2>
        <span className="text-xs font-mono text-muted-foreground">
          {rows.length} / {total}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Trade to unlock your first achievement.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {rows.map((r) => {
            const a = r.achievements;
            if (!a) return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic lucide icon lookup
            const Icon = ((Icons as any)[a.icon] ?? Icons.Trophy) as React.ComponentType<{
              className?: string;
            }>;
            const grad = TIER_COLOR[a.tier] ?? TIER_COLOR.bronze;
            return (
              <div
                key={r.code}
                className="flex flex-col items-center text-center p-2 rounded-lg border border-border/60 bg-background/40"
                title={a.description}
              >
                <div
                  className={`h-12 w-12 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow`}
                >
                  <Icon className="h-6 w-6 text-background" />
                </div>
                <div className="text-[11px] font-semibold mt-1.5 line-clamp-1">{a.title}</div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {a.tier}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
