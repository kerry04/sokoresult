import { createFileRoute, Link } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/coming-soon")({
  head: () => ({ meta: [{ title: "Coming soon — SokoResult" }] }),
  component: ComingSoonPage,
});

function ComingSoonPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
          <Construction className="h-7 w-7 text-primary-foreground/90" />
        </div>
        <h1 className="text-3xl font-bold">Coming soon</h1>
        <p className="mt-2 text-muted-foreground">
          This feature is part of Phase 2. We're focused on getting markets &amp; trading right first.
        </p>
        <Button asChild className="mt-6">
          <Link to="/markets">Back to markets</Link>
        </Button>
      </div>
    </div>
  );
}
