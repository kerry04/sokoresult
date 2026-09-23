import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Intentional empty state — never renders zeros or fake metrics.
 * Used when no live markets exist (globally or for a category filter).
 */
export function EmptyMarketState({
  title = "No live markets yet",
  copy = "New markets are being prepared. Check back soon — or create an account and be first in line when trading opens.",
  topic,
}: {
  title?: string;
  copy?: string;
  topic?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center sm:py-20">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <CalendarClock className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{topic ? `No ${topic} markets yet` : title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{copy}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          className="bg-success font-semibold text-success-foreground hover:bg-success/90"
        >
          <Link to="/signup">Create free account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/learn/how-to-trade">Learn how it works</Link>
        </Button>
      </div>
    </div>
  );
}
