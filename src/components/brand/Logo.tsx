import { cn } from "@/lib/utils";
import logoSrc from "@/assets/sokoresult-logo.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  withMark?: boolean;
  wordmark?: boolean;
}

const sizeMap = {
  sm: { text: "text-sm", mark: "h-7 w-7", gap: "gap-2" },
  md: { text: "text-base", mark: "h-9 w-9", gap: "gap-2.5" },
  lg: { text: "text-xl", mark: "h-12 w-12", gap: "gap-3" },
};

/* Apple-style wordmark using SF Pro stack with tight tracking. */
const APPLE_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';

export function Logo({ className, size = "md", withMark = true, wordmark = true }: LogoProps) {
  const s = sizeMap[size];
  return (
    <span className={cn("inline-flex items-center select-none", s.gap, className)}>
      {withMark && (
        <span className={cn("relative inline-flex items-center justify-center shrink-0", s.mark)}>
          <img
            src={logoSrc}
            alt="SokoResult"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </span>
      )}
      {wordmark && (
        <span
          className={cn(
            "font-semibold leading-none whitespace-nowrap",
            s.text,
          )}
          style={{
            fontFamily: APPLE_FONT_STACK,
            letterSpacing: "-0.02em",
            fontFeatureSettings: '"ss01", "cv11"',
          }}
        >
          <span className="text-success">$OKO</span>
          <span className="text-foreground">RESULT</span>
        </span>
      )}
    </span>
  );
}
