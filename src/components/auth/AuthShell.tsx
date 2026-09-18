import * as React from "react";
import { Logo } from "@/components/brand/Logo";
import { Link } from "@tanstack/react-router";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-gradient-hero">
      <Link to="/" className="mb-6">
        <Logo size="lg" />
      </Link>
      <div className="w-full max-w-[440px] rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-6 sm:p-8 shadow-card">
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
