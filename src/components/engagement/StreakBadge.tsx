import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function StreakBadge({
  count,
  size = "sm",
  className,
}: {
  count: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (!count || count < 1) return null;
  const sz = size === "lg" ? "text-base px-3 py-1.5" : size === "md" ? "text-sm px-2.5 py-1" : "text-xs px-2 py-0.5";
  const icon = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-mono font-bold border",
        "bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/40 text-orange-400",
        sz,
        className,
      )}
      title={`${count}-day trading streak`}
    >
      <Flame className={cn(icon, "fill-orange-500/40")} />
      {count}
    </span>
  );
}
