import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  fallback?: string;
  label?: string;
  className?: string;
}

/**
 * Back button that uses browser history when available, otherwise falls back
 * to a safe route. Prevents users from getting stuck on dead-end pages.
 */
export function BackButton({ fallback = "/markets", label = "Back", className }: BackButtonProps) {
  const router = useRouter();
  const handle = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: fallback });
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={handle} className={className}>
      <ArrowLeft className="h-4 w-4" /> {label}
    </Button>
  );
}
