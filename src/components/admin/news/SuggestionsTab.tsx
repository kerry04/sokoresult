import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Sparkles, Bot, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { timeAgo, type MarketSuggestion } from "./types";

export function SuggestionsTab({
  suggestions,
  onChange,
}: {
  suggestions: MarketSuggestion[];
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [minEdge, setMinEdge] = useState(0);
  const list = suggestions
    .filter((s) => filter === "all" || s.status === filter)
    .filter((s) => (s.edge_score ?? 0) >= minEdge);

  const reject = async (id: string) => {
    const { error } = await supabase.from("market_suggestions").update({ status: "rejected" }).eq("id", id);
    if (error) toast.error(friendlyError(error));
    else {
      toast.success("Rejected");
      onChange();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((v) => {
          const count = suggestions.filter((s) => v === "all" || s.status === v).length;
          return (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs uppercase tracking-wider border",
                filter === v ? "bg-primary/20 border-primary/50 text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {v} <span className="font-mono ml-1">{count}</span>
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          Min edge <span className="font-mono text-foreground">{minEdge.toFixed(2)}</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value))}
            className="w-32 accent-primary"
          />
        </label>
      </div>

      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {list.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary-foreground/80 border border-primary/20">
                      {s.suggested_category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {s.auto_generated ? (
                        <><Bot className="h-3 w-3" /> auto</>
                      ) : (
                        <><Hand className="h-3 w-3" /> manual</>
                      )}
                    </span>
                    <span className={cn("font-mono", statusColor(s.status))}>{s.status}</span>
                    <span className="ml-auto normal-case tracking-normal text-muted-foreground">
                      {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground">{s.suggested_question}</h3>
                  <div className="mt-2 text-xs text-muted-foreground italic line-clamp-2">{s.ai_reasoning}</div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Stat label="Edge" value={(s.edge_score ?? 0).toFixed(2)} bar={s.edge_score ?? 0} />
                    <Stat label="YES prior" value={`KSh ${(s.suggested_yes_price * 100).toFixed(0)}`} />
                    <Stat label="Confidence" value={`${(s.confidence * 100).toFixed(0)}%`} bar={s.confidence} />
                    <Stat
                      label="Horizon"
                      value={s.horizon ? s.horizon : `${s.news_count} src`}
                    />
                  </div>
                  {(s.event_type || (s.key_entities && s.key_entities.length > 0)) && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px]">
                      {s.event_type && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/40 border border-border uppercase tracking-wider">
                          {s.event_type.replace("_", " ")}
                        </span>
                      )}
                      {(s.key_entities ?? []).slice(0, 4).map((e) => (
                        <span key={e} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.suggested_close_at && (
                    <div className="mt-2 text-xs text-muted-foreground font-mono">
                      Closes: {new Date(s.suggested_close_at).toLocaleString("en-KE")}
                    </div>
                  )}
                </div>

                {s.status === "pending" && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      to="/admin/markets/create"
                      search={{
                        from: s.id,
                        question: s.suggested_question,
                        category: s.suggested_category,
                        yes: s.suggested_yes_price,
                        closes: s.suggested_close_at ?? undefined,
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-success/10 border border-success/30 text-success text-xs font-medium hover:bg-success/20"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Link>
                    <button
                      onClick={() => reject(s.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/20"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 mx-auto mb-2 opacity-50" />
            No {filter === "all" ? "" : filter} suggestions.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="rounded-md bg-muted/20 border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-bold mt-0.5">{value}</div>
      {bar !== undefined && (
        <div className="mt-1 h-1 rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, bar * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function statusColor(status: string) {
  if (status === "approved") return "text-success";
  if (status === "rejected") return "text-destructive";
  return "text-warning";
}
