// Bunkie service worker: keeps the app shell and room photos available on weak connections, and
// shows phone notifications. API calls, auth and payments always go to the network.
// On localhost it only handles notifications (no caching, so dev builds never go stale).
const SHELL = "bunkie-shell-v3";
const DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);
const PHOTOS = "bunkie-photos-v1";

self.addEventListener("install", (e) => {
  if (DEV) return void self.skipWaiting();
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
  if (DEV || req.method !== "GET") return;
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

// Notifications. If that chat (or page) is already open and in view, don't show it.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const url = d.url || "/explore";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      if (wins.some((w) => w.visibilityState === "visible" && new URL(w.url).pathname === url)) return;
      return self.registration.showNotification(d.title || "Bunkie", {
        body: d.body || "",
        tag: d.tag,
        renotify: !!d.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/explore";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
