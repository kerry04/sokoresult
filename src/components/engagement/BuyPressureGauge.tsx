import { cn } from "@/lib/utils";

export function BuyPressureGauge({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider mb-1">
        <span className="text-success">{clamped}% buying</span>
        <span className="text-muted-foreground">Crowd sentiment (6h)</span>
        <span className="text-destructive">{100 - clamped}% selling</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-muted/40 relative">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-success to-success/70 transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-destructive to-destructive/70 transition-[width] duration-500"
          style={{ width: `${100 - clamped}%` }}
        />
      </div>
    </div>
  );
}
