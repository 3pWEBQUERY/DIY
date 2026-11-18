"use client";

/**
 * Woher wurde der Story-Betrachter geöffnet? Beim Schliessen geht es dorthin zurück
 * (Feed, Profil, Nachrichten). Ohne Eintrag (Link von aussen) führt „Schliessen“ in den Feed.
 */
const KEY = "werkuno:story-return";

const OPENER = "werkuno:story-opener";

/** Als onClick des öffnenden Links: merkt sich Rücksprungadresse und Link (Fokus beim Schliessen). */
export function rememberStoryReturn(e?: { currentTarget: EventTarget | null }) {
  try {
    sessionStorage.setItem(KEY, window.location.pathname + window.location.search);
    const href = e?.currentTarget instanceof Element ? e.currentTarget.getAttribute("href") : null;
    if (href) sessionStorage.setItem(OPENER, href);
    else sessionStorage.removeItem(OPENER);
  } catch {
    /* privates Fenster o. ä. – dann eben in den Feed */
  }
}

/**
 * Nach dem Schliessen des Betrachters den öffnenden Link wieder fokussieren, sobald die
 * Ursprungsseite steht (höchstens ~2 s warten). Nur, wenn der Fokus sonst verloren wäre.
 */
export function restoreStoryOpenerFocus(viewer?: Element | null) {
  let href: string | null = null;
  try {
    href = sessionStorage.getItem(OPENER);
    sessionStorage.removeItem(OPENER);
  } catch {}
  if (!href) return;
  const sel = `a[href="${CSS.escape(href)}"]`;
  let frames = 0;
  const tick = () => {
    const active = document.activeElement;
    // Fokus liegt schon sinnvoll woanders (nicht mehr im Betrachter) → nichts tun
    if (active && active !== document.body && active.isConnected && !viewer?.contains(active)) return;
    const el = document.querySelector<HTMLElement>(sel);
    if (el && !el.closest("[inert]")) return el.focus({ preventScroll: true });
    if (++frames < 120) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function takeStoryReturn(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}

/** Im Betrachter wurde etwas gesehen → Story-Kreis beim Zurückkehren neu laden (statt Stand aus dem Cache). */
const CHANGED = "werkuno:stories-changed";
export function markStoriesChanged() {
  try {
    sessionStorage.setItem(CHANGED, "1");
  } catch {}
}
export function consumeStoriesChanged() {
  try {
    const v = sessionStorage.getItem(CHANGED) === "1";
    sessionStorage.removeItem(CHANGED);
    return v;
  } catch {
    return false;
  }
}
