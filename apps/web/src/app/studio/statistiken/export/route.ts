import { currentUser } from "@/server/auth/session";
import { contentStats } from "@/server/analytics/studio";
import { isPro } from "@/server/pro/service";

export const dynamic = "force-dynamic";

/** Creator Pro: Statistik je Inhalt als CSV (Excel-tauglich: UTF-8 mit BOM, Semikolon). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user?.profile) return new Response("Bitte melde dich an.", { status: 401 });
  if (!(await isPro(user.id))) return new Response("Der CSV-Export ist Teil von Creator Pro.", { status: 403 });
  const year = new URL(req.url).searchParams.get("zeitraum") === "jahr";
  const s = await contentStats(user.id, year ? 52 : 12);
  const range = year ? "12 Monate" : "12 Wochen";
  const esc = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
  const rows: unknown[][] = [["Typ", "Titel", "Veröffentlicht", "Aufrufe gesamt", `Aufrufe (${range})`, "Gefällt mir", "Gemerkt", "Kommentare", "Nachbauten/Abschlüsse/Verkäufe"]];
  for (const p of s.projects) rows.push(["Projekt", p.title, d(p.publishedAt), p.viewCount, s.viewsInRange(p.id), p.likeCount, p.saveCount, p.commentCount, p.remixCount]);
  for (const t of s.tutorials) rows.push(["Anleitung", t.title, d(t.publishedAt), t.viewCount, s.viewsInRange(t.id), t.likeCount, t.saveCount, "", t.completionCount]);
  for (const a of s.articles) rows.push(["Artikel", a.title, d(a.publishedAt), a.viewCount, s.viewsInRange(a.id), a.likeCount, "", "", ""]);
  for (const p of s.posts) rows.push(["Beitrag", p.body.replace(/\s+/g, " ").slice(0, 120), d(p.publishedAt), "", "", p.likeCount, p.saveCount, p.commentCount, ""]);
  for (const p of s.products) rows.push(["Produkt", p.title, d(p.publishedAt), p.viewCount, s.viewsInRange(p.id), "", p.saveCount, "", p._count.orderItems]);
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const name = `werkuno-statistik-${user.profile.handle}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
