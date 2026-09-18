import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a post-login redirect target. Only allows in-app paths to prevent
 * open-redirect / phishing attacks via crafted ?redirect=https://evil.com links.
 *
 * Rules: must start with "/", must NOT start with "//" or "/\\" (protocol-relative),
 * must NOT contain "://" anywhere (absolute URL), must NOT contain whitespace.
 * Anything that fails falls back to the provided default (defaults to "/markets").
 */
export function safeRedirect(target: unknown, fallback = "/markets"): string {
  if (typeof target !== "string") return fallback;
  const t = target.trim();
  if (!t) return fallback;
  if (!t.startsWith("/")) return fallback;
  if (t.startsWith("//") || t.startsWith("/\\")) return fallback;
  if (t.includes("://")) return fallback;
  if (/\s/.test(t)) return fallback;
  // Block "/login" / "/signup" loops
  if (t === "/login" || t === "/signup") return fallback;
  return t;
}
