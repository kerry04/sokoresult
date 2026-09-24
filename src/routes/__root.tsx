import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { LanguageProvider } from "@/lib/i18n";
import { getAdminEnabled } from "@/lib/admin-gate.functions";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-neutral-900">404</h1>
        <p className="mt-3 text-sm text-neutral-600">This page doesn&apos;t exist.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="text-sm font-medium text-neutral-900 underline underline-offset-4 hover:text-neutral-600"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// Whether this deployment is the admin-only one. Cached per browser tab;
// ADMIN_ENABLED never changes at runtime. On the server the env var is read
// directly (zero cost); on the client it goes through the server function
// once, so the public site pays no per-navigation penalty.
let adminEnabledCache: boolean | null = null;

async function isAdminDeployment(): Promise<boolean> {
  if (typeof window === "undefined") return process.env.ADMIN_ENABLED === "true";
  if (adminEnabledCache === null) adminEnabledCache = await getAdminEnabled();
  return adminEnabledCache;
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Admin-only deployment: the public surface is disabled here so the
    // admin domain never serves the marketing site or trading pages.
    // The root path lands on the admin dashboard instead; /api stays
    // reachable (admin UI uses it, cron hooks live there).
    if (!(await isAdminDeployment())) return;
    const pathname = location.pathname;
    if (pathname === "/") throw redirect({ to: "/admin" });
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    throw notFound();
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SokoResult — Africa's Prediction Market" },
      {
        name: "description",
        content:
          "Trade outcomes on African politics, sports, entertainment, and culture. Put your money where your mouth is.",
      },
      { name: "author", content: "SokoResult" },
      { name: "theme-color", content: "#06060f" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "SokoResult" },
      { property: "og:title", content: "SokoResult — Africa's Prediction Market" },
      {
        property: "og:description",
        content: "Trade outcomes on African politics, sports, and culture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "SokoResult — Africa's Prediction Market" },
      { name: "description", content: "Africa's rising prediction market and news platform" },
      {
        property: "og:description",
        content: "Africa's rising prediction market and news platform",
      },
      {
        name: "twitter:description",
        content: "Africa's rising prediction market and news platform",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // Theme class is managed by ThemeProvider (dark by default, persisted choice).
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Installable PWA: register the conservative service worker (static assets
  // only — never API/Supabase/navigations). Production only, to keep dev clean.
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is a nice-to-have; never break the app over it */
      });
    }
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <Outlet />
          <ThemedToaster />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster richColors position="top-right" theme={theme} />;
}
