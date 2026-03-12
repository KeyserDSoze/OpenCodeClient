// sw.js — OpenCode Client Service Worker
// Network-first for all same-origin requests so updated JS/CSS chunks are
// always fetched fresh. Falls back to cache when offline.

const CACHE_NAME = "opencode-v3";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET or cross-origin requests
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Network-first for everything: always try to fetch fresh, cache as backup.
  // This prevents stale JS/CSS chunks from causing duplicate-React errors after
  // a build update.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});
