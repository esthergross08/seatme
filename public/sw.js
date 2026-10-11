// SeatMe service worker.
//
// Deliberately conservative: it makes the app installable and load fast, but it
// never caches page HTML or API/Supabase responses. Seating plans are private
// and edited live (sometimes by several people), so a stale cached copy would
// be worse than no copy. When the network is down, page loads fall back to a
// small offline screen instead of the browser's error page.
//
// Bump VERSION whenever this file's caching logic changes; old caches are
// cleared on activate.

const VERSION = "v1";
const STATIC_CACHE = `seatme-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("seatme-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Supabase, Pinterest, fonts CDN etc. — leave entirely to the browser.
  if (url.origin !== self.location.origin) return;
  // Data and auth must always hit the server.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Page loads: always network. Offline → friendly fallback page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error())
      )
    );
    return;
  }

  // Next's hashed build assets never change for a given URL → cache-first.
  // Same for our icons.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
        )
      )
    );
  }
  // Everything else: default browser behaviour.
});
