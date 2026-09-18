import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function CountdownPill({ closesAt, className }: { closesAt: string | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0)
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground", className)}>
        <Clock className="h-3 w-3" /> Closed
      </span>
    );
  if (ms > 24 * 3600 * 1000) return null;

  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const urgent = ms < 3_600_000;
  const veryUrgent = ms < 600_000;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border",
        veryUrgent
          ? "bg-destructive/20 border-destructive/50 text-destructive animate-pulse"
          : urgent
            ? "bg-warning/15 border-warning/40 text-warning"
            : "bg-muted/50 border-border text-foreground",
        className,
      )}
    >
      <Clock className="h-3 w-3" /> {label}
    </span>
  );
}
