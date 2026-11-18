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

const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Abstand Zürich – UTC in ms zum Zeitpunkt `t`. */
function zurichOffset(t: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(t / 1000) * 1000;
}

/**
 * Wandzeit in Zürich (Tag `YYYY-MM-DD`, Uhrzeit `HH:MM[:SS]`) als ISO-Zeitpunkt – unabhängig von der
 * Zeitzone des Browsers/Servers. Leerer oder ungültiger Tag → null (statt RangeError bei toISOString).
 */
export function zurichDateTimeIso(day: string, time = "00:00:00"): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!m || !t) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]), Number(t[3] ?? 0));
  if (Number.isNaN(wall)) return null;
  // Zwei Schritte, damit auch Tage mit Zeitumstellung stimmen
  let utc = wall - zurichOffset(wall);
  utc = wall - zurichOffset(utc);
  return new Date(utc).toISOString();
}

/** Zürcher Kalendertag `day` plus `n` Tage (YYYY-MM-DD); leer bei ungültigem Tag. */
export function addDaysToDayKey(day: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) return "";
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}
