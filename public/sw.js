/* SokoResult service worker — deliberately conservative.
 *
 * - Same-origin static assets (JS/CSS/images/fonts): cache-first, versioned
 *   cache. Vite emits content-hashed filenames, so stale assets are safe.
 * - Everything else (navigations, /api/*, Supabase, cross-origin, non-GET):
 *   NOT intercepted — always hits the network. Live trading data must
 *   never be served stale, and the HTML shell is never cached.
 *
 * Bump VERSION to invalidate the static cache after asset changes.
 */
const VERSION = "sokoresult-v1";
const STATIC_CACHE = `static-${VERSION}`;

const STATIC_RE = /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheable(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/.well-known/")) return false;
  return STATIC_RE.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!isCacheable(req)) return; // network untouched
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })(),
  );
});
