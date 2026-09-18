import { Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS = [
  { min: 1_000_000_000, name: "Platinum", color: "from-cyan-300 to-violet-400 text-background" },
  { min: 100_000_000, name: "Gold", color: "from-yellow-500 to-amber-300 text-background" },
  { min: 10_000_000, name: "Silver", color: "from-slate-400 to-slate-200 text-background" },
  { min: 1_000_000, name: "Bronze", color: "from-orange-700 to-orange-500 text-background" },
];

export function VolumeTierBadge({ volumeCents }: { volumeCents: number }) {
  const tier = TIERS.find((t) => volumeCents >= t.min);
  if (!tier) return null;
  const Icon = tier.name === "Platinum" ? Crown : Medal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-gradient-to-br shadow-sm",
        tier.color,
      )}
      title={`${tier.name} VIP — KSh ${(tier.min / 100).toLocaleString()}+ traded`}
    >
      <Icon className="h-3.5 w-3.5" />
      {tier.name} VIP
    </span>
  );
}
