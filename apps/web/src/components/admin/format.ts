/** Formatierung für Kennzahlen (de-CH). */
const nf = new Intl.NumberFormat("de-CH");
const nf1 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

export function num(n: number | null | undefined) {
  return n == null ? "–" : nf.format(n);
}

export function dec(n: number | null | undefined) {
  return n == null ? "–" : nf1.format(n);
}

export function pct(x: number | null | undefined) {
  return x == null ? "–" : `${nf1.format(x * 100)} %`;
}

/** Relative Veränderung (z. B. +0.12 = +12 %); null, wenn keine Basis vorhanden ist. */
export function delta(cur: number, prev: number) {
  return prev > 0 ? (cur - prev) / prev : null;
}

export function duration(seconds: number | null | undefined) {
  if (seconds == null) return "–";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} Min.`;
  const h = m / 60;
  if (h < 48) return `${nf1.format(h)} Std.`;
  return `${nf1.format(h / 24)} Tage`;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${nf1.format(n / 1024)} KB`;
  return `${nf1.format(n / 1024 / 1024)} MB`;
}

export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Zurich" });
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
}

export function weekLabel(iso: string) {
  return `Woche ab ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-CH", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}
