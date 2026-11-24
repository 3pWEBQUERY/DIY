import "server-only";
import { contentStats } from "./studio";

type ContentStats = Awaited<ReturnType<typeof contentStats>>;

/** Zeitraum der Studio-Statistik: 12 Wochen (alle) oder 12 Monate (= 52 Wochen, Creator Pro). */
export type StatsRange = "wochen" | "jahr";
export const statsWeeks = (range: StatsRange) => (range === "jahr" ? 52 : 12);
export const parseStatsRange = (v: string | null | undefined): StatsRange => (v === "jahr" ? "jahr" : "wochen");

/**
 * Statistik je Inhalt als CSV (Excel-tauglich: UTF-8 mit BOM, Semikolon) – gemeinsam für den
 * Web-Download (/studio/statistiken/export) und die App (GET /studio/stats/export).
 */
export function statsCsv(s: ContentStats, range: StatsRange) {
  const label = range === "jahr" ? "12 Monate" : "12 Wochen";
  const esc = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
  const rows: unknown[][] = [["Typ", "Titel", "Veröffentlicht", "Aufrufe gesamt", `Aufrufe (${label})`, "Gefällt mir", "Gemerkt", "Kommentare", "Nachbauten/Abschlüsse/Verkäufe"]];
  for (const p of s.projects) rows.push(["Projekt", p.title, d(p.publishedAt), p.viewCount, s.viewsInRange(p.id), p.likeCount, p.saveCount, p.commentCount, p.remixCount]);
  for (const t of s.tutorials) rows.push(["Anleitung", t.title, d(t.publishedAt), t.viewCount, s.viewsInRange(t.id), t.likeCount, t.saveCount, "", t.completionCount]);
  for (const a of s.articles) rows.push(["Artikel", a.title, d(a.publishedAt), a.viewCount, s.viewsInRange(a.id), a.likeCount, "", "", ""]);
  for (const p of s.posts) rows.push(["Beitrag", p.body.replace(/\s+/g, " ").slice(0, 120), d(p.publishedAt), "", "", p.likeCount, p.saveCount, p.commentCount, ""]);
  for (const p of s.products) rows.push(["Produkt", p.title, d(p.publishedAt), p.viewCount, s.viewsInRange(p.id), "", p.saveCount, "", p._count.orderItems]);
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export const statsCsvFilename = (handle: string, now = new Date()) => `werkuno-statistik-${handle}-${now.toISOString().slice(0, 10)}.csv`;

/**
 * Statistik für die App: Zahlen je Inhalt plus Verlauf der Aufrufe je Woche (`trends`), damit die
 * App Verlaufslinien zeichnen kann (Funktionen wie `trend()` überleben JSON nicht).
 */
export function statsPayload(s: ContentStats, range: StatsRange, pro: boolean) {
  const ids = [...s.projects, ...s.tutorials, ...s.articles, ...s.products].map((x) => x.id);
  const trends: Record<string, number[]> = {};
  const viewsInRange: Record<string, number> = {};
  for (const id of ids) {
    trends[id] = s.trend(id);
    viewsInRange[id] = s.viewsInRange(id);
  }
  // Summe je Woche über alle Inhalte (Gesamtverlauf oben in der App)
  const totals = s.weeks.map((_, i) => ids.reduce((sum, id) => sum + (trends[id]![i] ?? 0), 0));
  return { projects: s.projects, tutorials: s.tutorials, articles: s.articles, posts: s.posts, products: s.products, weeks: s.weeks, trends, viewsInRange, totals, range, pro, canExport: pro, yearAvailable: pro };
}
