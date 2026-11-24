import "server-only";
import { addDaysToDayKey, zurichDateTimeIso, zurichDayKey } from "@/lib/tz";
import { calendarDays, isoWeekKey } from "@/lib/calendar-weeks";
import { CALENDAR_KIND_LABEL, contentCalendar, upcomingScheduled, type CalendarItem } from "./calendar";

/**
 * Inhaltskalender für die App (gleiche Daten wie /studio/kalender): Tage des Monats- bzw. Wochenrasters
 * mit ihren Einträgen (Zürich-Tage), Titel, Schlüssel für vor/zurück und die nächsten geplanten Inhalte.
 */
export async function calendarView(userId: string, opts: { week: boolean; month?: string | null; weekKey?: string | null }) {
  const cal = calendarDays({ week: opts.week, monat: opts.month ?? undefined, woche: opts.weekKey ?? undefined });
  const from = new Date(zurichDateTimeIso(cal.gridStart) ?? `${cal.gridStart}T00:00:00Z`);
  const to = new Date(zurichDateTimeIso(addDaysToDayKey(cal.gridEnd, 1)) ?? `${cal.gridEnd}T23:59:59Z`);
  const [items, upcoming] = await Promise.all([contentCalendar(userId, from, to), upcomingScheduled(userId)]);
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = zurichDayKey(new Date(it.at));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const today = zurichDayKey();
  return {
    view: opts.week ? ("week" as const) : ("month" as const),
    title: cal.title,
    month: cal.month,
    week: isoWeekKey(cal.gridStart),
    prev: cal.prev,
    next: cal.next,
    today,
    todayWeek: isoWeekKey(today),
    kinds: CALENDAR_KIND_LABEL,
    days: cal.days.map((d) => ({ day: d, inMonth: opts.week || d.startsWith(cal.month), today: d === today, items: byDay.get(d) ?? [] })),
    upcoming,
  };
}
