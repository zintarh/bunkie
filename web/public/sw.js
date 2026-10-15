// Bunkie service worker: keeps the app shell and room photos available on weak connections.
// API calls, auth and payments always go to the network.
const SHELL = "bunkie-shell-v2";
const PHOTOS = "bunkie-photos-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/welcome", "/explore", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, PHOTOS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Room photos never change at a given URL: cache first.
  if (url.pathname.includes("/storage/v1/render/image/public/listing-photos/") || url.pathname.startsWith("/demo/")) {
    e.respondWith(caches.open(PHOTOS).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }
  // Static build files: cache first.
  if (url.origin === location.origin && url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }
  // Pages: network first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/explore"))));
  }
});
