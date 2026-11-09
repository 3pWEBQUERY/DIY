/**
 * Plattform-Zeitzone: Werkuno richtet sich an die Schweiz. Serverseitig formatierte Daten und
 * Tages-/Wochenauswertungen nutzen Europe/Zurich statt der Server-Zeitzone (meist UTC).
 */
export const TZ = "Europe/Zurich";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Kalendertag in Zürich als YYYY-MM-DD. */
export function zurichDayKey(d: Date = new Date()) {
  return dayKeyFmt.format(d);
}

const DAY = 86_400_000;

/**
 * Lückenlose Tagesschlüssel (YYYY-MM-DD, Zürcher Kalender) der letzten `weeks` Wochen,
 * beginnend an einem Montag und endend mit dem Sonntag der aktuellen Woche.
 */
export function zurichWeekDays(weeks: number, now: Date = new Date()) {
  // Kalenderdatum als UTC-Mitternacht, damit die Tagesarithmetik nicht von Sommerzeit abhängt
  const today = new Date(`${zurichDayKey(now)}T00:00:00Z`);
  const monday = today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY;
  const start = monday - (weeks - 1) * 7 * DAY;
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
}
