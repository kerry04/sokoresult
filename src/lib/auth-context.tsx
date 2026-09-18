import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setSoundEnabled } from "@/lib/sound";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  kes_balance: number;
  oko_balance: number;
  kyc_tier: number;
  onboarded: boolean;
  referral_code: string | null;
  phone: string | null;
  current_streak: number;
  longest_streak: number;
  last_trade_date: string | null;
  sound_enabled: boolean;
}

export interface QueuedAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  achievementQueue: QueuedAchievement[];
  enqueueAchievements: (codes: string[]) => Promise<void>;
  dismissTopAchievement: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [achievementQueue, setAchievementQueue] = React.useState<QueuedAchievement[]>([]);

  const loadProfile = React.useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, kes_balance, oko_balance, kyc_tier, onboarded, referral_code, phone, current_streak, longest_streak, last_trade_date, sound_enabled",
      )
      .eq("id", uid)
      .maybeSingle();
    const p = (data as Profile | null) ?? null;
    setProfile(p);
    if (p) setSoundEnabled(p.sound_enabled);
  }, []);

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = React.useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const enqueueAchievements = React.useCallback(async (codes: string[]) => {
    if (!codes.length) return;
    const { data } = await supabase.from("achievements").select("*").in("code", codes);
    if (data) setAchievementQueue((prev) => [...prev, ...(data as QueuedAchievement[])]);
  }, []);

  const dismissTopAchievement = React.useCallback(() => {
    setAchievementQueue((prev) => prev.slice(1));
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      session,
      profile,
      loading,
      refreshProfile,
      signOut,
      achievementQueue,
      enqueueAchievements,
      dismissTopAchievement,
    }),
    [user, session, profile, loading, refreshProfile, signOut, achievementQueue, enqueueAchievements, dismissTopAchievement],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
