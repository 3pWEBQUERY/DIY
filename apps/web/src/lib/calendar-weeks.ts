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

/** `?monat=2026-11` → erster Tag; sonst aktueller Monat (Zürich) */
export function monthStart(raw: string | undefined) {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}-01` : `${zurichDayKey().slice(0, 7)}-01`;
}

export function shiftMonth(first: string, n: number) {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

const dayShort = new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", day: "numeric", month: "long" });
const monthLong = new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", month: "long", year: "numeric" });

/** „KW 48 · 23. – 29. November 2026“ */
export function weekTitle(from: string, to: string) {
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const kw = isoWeekKey(from).slice(6);
  return `KW ${Number(kw)} · ${sameMonth ? `${a.getUTCDate()}.` : dayShort.format(a)} – ${dayShort.format(b)} ${b.getUTCFullYear()}`;
}

/**
 * Tage des Kalenders: Woche (Mo–So) oder Monatsraster (Montag vor dem Ersten bis Sonntag nach dem
 * Letzten), dazu Titel und Schlüssel für vor/zurück – für die Studio-Seite und die App.
 */
export function calendarDays(opts: { week: boolean; monat?: string; woche?: string }) {
  const first = monthStart(opts.monat);
  const nextFirst = `${shiftMonth(first, 1)}-01`;
  const days: string[] = [];
  if (opts.week) {
    const ws = weekStart(opts.woche);
    for (let i = 0; i < 7; i++) days.push(addDaysToDayKey(ws, i));
  } else {
    const firstDow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const gridStart = addDaysToDayKey(first, -firstDow);
    const lastDay = addDaysToDayKey(nextFirst, -1);
    const lastDow = (new Date(`${lastDay}T00:00:00Z`).getUTCDay() + 6) % 7;
    const gridEnd = addDaysToDayKey(lastDay, 6 - lastDow);
    for (let d = gridStart; d && d <= gridEnd; d = addDaysToDayKey(d, 1)) days.push(d);
  }
  const gridStart = days[0]!;
  const gridEnd = days[days.length - 1]!;
  const title = opts.week ? weekTitle(gridStart, gridEnd) : monthLong.format(new Date(`${first}T12:00:00Z`));
  return {
    days,
    first,
    nextFirst,
    gridStart,
    gridEnd,
    month: first.slice(0, 7),
    title,
    prev: opts.week ? isoWeekKey(addDaysToDayKey(gridStart, -7)) : shiftMonth(first, -1),
    next: opts.week ? isoWeekKey(addDaysToDayKey(gridStart, 7)) : shiftMonth(first, 1),
  };
}
