// sw.js — OpenCode Client Service Worker
// Cache-first for static assets, network-first for API calls.

const CACHE_NAME = "opencode-v1";

// Assets to pre-cache on install (Vite hashes the filenames at build time,
// so we only pre-cache the shell files we know by path)
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
  // Activate immediately without waiting for existing tabs to close
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
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET or cross-origin API requests
  // (the OpenCode server lives on a different origin/port)
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigation requests so users always get fresh shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Cache-first for everything else (JS/CSS/images/fonts hashed by Vite)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Only cache successful same-origin responses
        if (!response.ok || response.type !== "basic") return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    }),
  );
});
