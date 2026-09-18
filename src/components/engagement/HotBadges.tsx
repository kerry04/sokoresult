import { Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function HotBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/50 bg-orange-500/15 text-orange-400 animate-pulse",
        className,
      )}
      title="High activity in the last hour"
    >
      <Flame className="h-3 w-3" /> HOT
    </span>
  );
}

export function VolatileBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/50 bg-yellow-500/15 text-yellow-400",
        className,
      )}
      title="Recent price movement is large"
    >
      <Zap className="h-3 w-3" /> VOLATILE
    </span>
  );
}

export function LiveTradersPill({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-success/40 bg-success/10 text-success",
        className,
      )}
      title={`${count} traders active in the last hour`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
      {count} trading now
    </span>
  );
}
