/*
 * Werkuno Service Worker: Push-Benachrichtigungen und installierbare Web-App (Android).
 * Kein Offline-Cache für Inhalte (angemeldete Seiten sollen nie aus einem geteilten Cache kommen) –
 * nur eine Offline-Seite, wenn eine Seite ohne Verbindung aufgerufen wird.
 */

const SHELL = "werkuno-shell-v1";
const SHELL_FILES = ["/offline.html", "/brand/werkuno-icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(SHELL_FILES).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Alte Shell-Caches aufräumen
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("werkuno-shell-") && k !== SHELL).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

// Nur Seitenaufrufe: normal aus dem Netz, ohne Verbindung die Offline-Seite
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(req);
      } catch {
        const cached = await caches.match("/offline.html");
        return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // Statische Datei ohne Build-Schritt – kann config/brand.ts nicht importieren. Der Server schickt den
  // Titel (BRAND.name) immer mit; dieser Rückfall muss bei einer Umbenennung von Hand angepasst werden.
  const title = data.title || "Werkuno";
  const options = {
    body: data.body || "Es gibt Neuigkeiten.",
    icon: "/brand/werkuno-icon-192.png",
    badge: "/brand/werkuno-icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    lang: "de-CH",
    data: { href: data.href || "/benachrichtigungen" },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Zähler auf dem App-Symbol (installierte Web-App), wo unterstützt
      if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
        try {
          await self.navigator.setAppBadge(data.badge);
        } catch {}
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/benachrichtigungen";
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Offenen Werkuno-Tab wiederverwenden
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
