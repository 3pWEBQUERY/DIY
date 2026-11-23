import { addDaysToDayKey, zurichDayKey } from "@/lib/tz";

/* Kalenderwochen (ISO 8601) für den Inhaltskalender: Montag bis Sonntag, Woche mit dem Donnerstag zählt. */

/** ISO-Kalenderwoche eines Tages: „2026-W48“ (Woche mit dem Donnerstag zählt) */
export function isoWeekKey(dayKey: string) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // Donnerstag dieser Woche
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** `?woche=2026-W48` → Montag dieser Woche; sonst Montag der aktuellen Woche (Zürich) */
export function weekStart(raw: string | undefined) {
  const m = /^(\d{4})-W(\d{2})$/.exec(raw ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 53) {
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (Number(m[2]) - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }
  const today = zurichDayKey();
  return addDaysToDayKey(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
}
