/**
 * Online-Status (gemeinsam für Server und Oberfläche). Web und App senden einen Herzschlag, solange sie
 * sichtbar bzw. im Vordergrund sind; ohne Herzschlag gilt man nach ONLINE_WINDOW_MS als offline.
 */
export const ONLINE_WINDOW_MS = 150_000;
/** Herzschlag des Browsers (sichtbarer Tab) */
export const PRESENCE_PING_MS = 60_000;

export type Presence = { online: boolean; lastOnlineAt: string | null };

/** „Online“ bzw. „zuletzt online …“ in Zürcher Zeit (wie WhatsApp). */
export function presenceLabel(p: Presence | null | undefined, now = Date.now()): string | null {
  if (!p) return null;
  if (p.online) return "Online";
  if (!p.lastOnlineAt) return null;
  const t = Date.parse(p.lastOnlineAt);
  const mins = Math.max(1, Math.round((now - t) / 60_000));
  if (mins < 60) return `Zuletzt online vor ${mins} Min.`;
  const tz = "Europe/Zurich";
  const day = (d: Date) => d.toLocaleDateString("de-CH", { timeZone: tz });
  const time = new Date(t).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (day(new Date(t)) === day(new Date(now))) return `Zuletzt online heute um ${time}`;
  if (day(new Date(t)) === day(new Date(now - 86_400_000))) return `Zuletzt online gestern um ${time}`;
  return `Zuletzt online am ${new Date(t).toLocaleDateString("de-CH", { day: "numeric", month: "long", timeZone: tz })}`;
}
