/**
 * Brücke zwischen dem Router-Hook in `instrumentation-client.ts` und der Ladeleiste (`NavProgress`).
 * Der Hook meldet nur echte App-Router-Navigationen – also nicht Klicks, deren Standardaktion
 * abgebrochen wurde, Links mit Modifikatortaste/`target="_blank"` oder Downloads.
 */
export const NAV_START_EVENT = "werkuno:navstart";

/** Ziel-URL einer startenden Navigation melden – ausser sie führt auf die aktuelle Seite (nur Anker o. Ä.). */
export function announceNavigation(href: string) {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search) return;
  window.dispatchEvent(new CustomEvent(NAV_START_EVENT, { detail: url.href }));
}
