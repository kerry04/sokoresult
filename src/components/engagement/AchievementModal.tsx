import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Share2 } from "lucide-react";
import { useEffect } from "react";
import { fireBigConfetti } from "./ConfettiBurst";
import { playLevelUp } from "@/lib/sound";

export interface AchievementUnlock {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum" | string;
}

const TIER_GLOW: Record<string, string> = {
  bronze: "from-orange-700 to-orange-500",
  silver: "from-slate-400 to-slate-200",
  gold: "from-yellow-500 to-amber-300",
  platinum: "from-cyan-300 to-violet-400",
};

export function AchievementModal({
  unlock,
  open,
  onClose,
}: {
  unlock: AchievementUnlock | null;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (open && unlock) {
      fireBigConfetti();
      playLevelUp();
    }
  }, [open, unlock]);

  if (!unlock) return null;
  const Icon = ((Icons as any)[unlock.icon] ?? Icons.Trophy) as React.ComponentType<{
    className?: string;
  }>;
  const grad = TIER_GLOW[unlock.tier] ?? TIER_GLOW.bronze;

  const share = async () => {
    const text = `🏆 I just unlocked "${unlock.title}" on SokoResult! ${unlock.description}`;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Achievement unlocked!", text, url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-md text-center bg-background border-2 border-primary/40 overflow-hidden">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="py-6 space-y-4"
        >
          <div className="text-xs uppercase tracking-[0.3em] text-primary font-bold">
            Achievement Unlocked
          </div>
          <motion.div
            animate={{ rotate: [0, -8, 8, -4, 4, 0] }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className={`mx-auto h-28 w-28 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-2xl ring-4 ring-primary/30`}
          >
            <Icon className="h-14 w-14 text-background" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold">{unlock.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{unlock.description}</p>
            <div className="mt-2 inline-block text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded border border-border bg-muted/30">
              {unlock.tier} tier
            </div>
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" size="sm" onClick={share}>
              <Share2 className="h-4 w-4 mr-1.5" /> Share
            </Button>
            <Button onClick={onClose}>Continue</Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
