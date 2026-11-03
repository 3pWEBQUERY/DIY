import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string, max = 64) {
  const s = input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "eintrag";
}

export function formatMinutes(min?: number | null) {
  if (min == null) return "–";
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function compactNumber(n: number) {
  return new Intl.NumberFormat("de-CH", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const rtf = new Intl.RelativeTimeFormat("de-CH", { numeric: "auto" });
export function relativeTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return d.toLocaleDateString("de-CH", { day: "numeric", month: "short", year: abs > 86400 * 300 ? "numeric" : undefined });
}

export function formatDate(
  date: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
) {
  return new Date(date).toLocaleDateString("de-CH", opts);
}

export function readingMinutes(text: string) {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

export function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

export function pluralize(n: number, one: string, many: string) {
  return `${new Intl.NumberFormat("de-CH").format(n)} ${n === 1 ? one : many}`;
}
