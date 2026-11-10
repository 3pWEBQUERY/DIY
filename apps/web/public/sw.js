/* Werkuno Service Worker – nur für Push-Benachrichtigungen (kein Offline-Cache). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
