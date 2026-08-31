/* ============================================================================
   SERVICE WORKER
   ----------------------------------------------------------------------------
   The app must open and work fully in airplane mode after the first visit.
   That is an acceptance test, not an aspiration.

   Strategy:
     navigations  network-first, falling back to the cached shell (so updates
                  land, but a plane still opens the app)
     app assets   cache-first (Vite hashes them, so a cached one is never stale)
     fonts        cache-first (Google Fonts is the only network origin we use)
   ========================================================================== */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const FONTS = `fonts-${VERSION}`;

const SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL("./", SCOPE).toString();

const PRECACHE = [
  "./",
  "./index.html",
  "./onboarding-article.txt",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
].map((p) => new URL(p, SCOPE).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, FONTS]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isFont = (url: URL) =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isFont(url)) {
    event.respondWith(cacheFirst(request, FONTS).catch(() => Response.error()));
    return;
  }

  // Anything off-origin that is not a font is not ours to cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          await cache.put(SHELL_URL, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match(SHELL_URL)) ??
            (await cache.match(new URL("./index.html", SCOPE).toString())) ??
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    cacheFirst(request, ASSETS).catch(async () => {
      const cache = await caches.open(SHELL);
      return (await cache.match(request)) ?? Response.error();
    }),
  );
});

export {};
