"use client";

/**
 * Woher wurde der Story-Betrachter geöffnet? Beim Schliessen geht es dorthin zurück
 * (Feed, Profil, Nachrichten). Ohne Eintrag (Link von aussen) führt „Schliessen“ in den Feed.
 */
const KEY = "werkuno:story-return";

export function rememberStoryReturn() {
  try {
    sessionStorage.setItem(KEY, window.location.pathname + window.location.search);
  } catch {
    /* privates Fenster o. ä. – dann eben in den Feed */
  }
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
