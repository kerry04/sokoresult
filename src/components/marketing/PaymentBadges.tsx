import { cn } from "@/lib/utils";
import okoCoin from "@/assets/oko-coin.png";
import visaLogo from "@/assets/visa.png";

/* Compact, neat payment chips. Each chip is a small rounded card with a clean
   logo lockup — matching a refined trader-product aesthetic. */

function Chip({
  children,
  className,
  bg = "var(--color-card)",
  ring = "var(--color-border)",
}: {
  children: React.ReactNode;
  className?: string;
  bg?: string;
  ring?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-xl h-11 px-4 min-w-[88px]",
        "transition-all duration-200 hover:-translate-y-0.5",
        className,
      )}
      style={{
        background: bg,
        boxShadow: `inset 0 0 0 1px ${ring}, 0 2px 8px -2px rgba(0,0,0,0.4)`,
      }}
    >
      {children}
    </div>
  );
}

function MpesaChip() {
  return (
    <Chip bg="oklch(0.18 0.025 280)">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white font-black text-[11px]"
          style={{ background: "linear-gradient(180deg, #58c060, #2f8a37)" }}
        >
          M
        </span>
        <span className="font-bold text-[13px] tracking-wide text-foreground">
          PESA
        </span>
      </span>
    </Chip>
  );
}

function VisaChip() {
  return (
    <Chip bg="#ffffff">
      <img src={visaLogo} alt="Visa" className="h-6 w-auto object-contain" draggable={false} />
    </Chip>
  );
}

function MastercardChip() {
  return (
    <Chip bg="oklch(0.18 0.025 280)">
      <svg viewBox="0 0 36 22" className="h-5 w-auto" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="11" r="9" fill="#EB001B" />
        <circle cx="22" cy="11" r="9" fill="#F79E1B" />
        <path d="M18 4.5a9 9 0 0 0 0 13 9 9 0 0 0 0-13Z" fill="#FF5F00" />
      </svg>
    </Chip>
  );
}

function OkoChip() {
  return (
    <Chip
      bg="linear-gradient(135deg, oklch(0.22 0.06 305) 0%, oklch(0.16 0.04 290) 100%)"
      ring="color-mix(in oklab, var(--primary) 55%, transparent)"
      className="shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <img src={okoCoin} alt="" className="h-5 w-5 object-contain" draggable={false} />
        <span className="font-mono font-extrabold text-[14px] tracking-wide text-success">
          $OKO
        </span>
      </span>
    </Chip>
  );
}

interface PaymentBadgesProps {
  className?: string;
  showLabel?: boolean;
}

export function PaymentBadges({ className, showLabel = false }: PaymentBadgesProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 sm:gap-3", className)}>
      {showLabel && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mr-1">
          Pay via
        </span>
      )}
      <MpesaChip />
      <VisaChip />
      <MastercardChip />
      <OkoChip />
    </div>
  );
}
