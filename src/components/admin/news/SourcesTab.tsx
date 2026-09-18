import { cn } from "@/lib/utils";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { AlertTriangle } from "lucide-react";
import { timeAgo, type SourceHealth } from "./types";

export function SourcesTab({ health }: { health: SourceHealth[] }) {
  const byKey = new Map(health.map((h) => [h.source, h]));
  const rows = NEWS_SOURCES.map((s) => ({ meta: s, h: byKey.get(s.source) }));

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card/30">
      <div className="grid grid-cols-[1.5fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
        <div>Source</div>
        <div className="text-right">24h</div>
        <div className="text-right">Last fetch</div>
        <div className="text-right">Failures</div>
        <div className="text-right">Status</div>
      </div>
      <div className="divide-y divide-border">
        {rows.map(({ meta, h }) => {
          const status = h?.status ?? "stale";
          return (
            <div
              key={meta.source}
              className="grid grid-cols-[1.5fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 items-center text-sm hover:bg-card/50"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{meta.display}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {meta.method}
                  {h?.last_error ? ` · ${h.last_error.slice(0, 60)}` : ""}
                </div>
              </div>
              <div className="text-right font-mono text-success">+{h?.articles_24h ?? 0}</div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                {timeAgo(h?.last_success_at ?? null)}
              </div>
              <div
                className={cn(
                  "text-right font-mono text-xs inline-flex items-center justify-end gap-1",
                  (h?.consecutive_failures ?? 0) > 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {(h?.consecutive_failures ?? 0) > 0 && <AlertTriangle className="h-3 w-3" />}
                {h?.consecutive_failures ?? 0}
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <span className={cn("h-1.5 w-1.5 rounded-full", chipDot(status))} />
                <span className={cn("text-xs uppercase tracking-wider", chipText(status))}>
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function chipDot(status: string) {
  if (status === "active") return "bg-success animate-pulse";
  if (status === "stale") return "bg-warning";
  return "bg-destructive";
}
function chipText(status: string) {
  if (status === "active") return "text-success";
  if (status === "stale") return "text-warning";
  return "text-destructive";
}
