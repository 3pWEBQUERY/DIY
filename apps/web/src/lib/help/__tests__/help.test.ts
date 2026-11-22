import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_CATEGORIES, articleAnswer, fillHelp, plainHelp, type HelpVars } from "../content";
import { normalizeHelp, searchHelp, type HelpIndexEntry } from "../search";

const vars: HelpVars = {
  brand: "Werkuno",
  minAge: 18,
  fee: "6 %",
  proFee: "4 %",
  supportFee: "15 %",
  iosMarkup: "30 %",
  holdDays: "3 Tage",
  autoCompleteDays: "14 Tage",
  reservationMinutes: 30,
  proMonth: "CHF 9.00",
  proYear: "CHF 90.00",
};

const index: HelpIndexEntry[] = HELP_CATEGORIES.flatMap((c) =>
  c.articles.map((a) => ({ categoryId: c.id, categoryTitle: c.title, id: a.id, q: fillHelp(a.q, vars), text: plainHelp(articleAnswer(a, vars)), tags: a.tags ?? "" })),
);

/** Alle Seiten der App als Muster (Routengruppen und Slots entfernt, [param] → beliebiges Segment) */
function appRoutes() {
  const root = path.resolve(__dirname, "../../../app");
  const out: RegExp[] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        const skip = (name.startsWith("(") && name.endsWith(")")) || name.startsWith("@");
        walk(full, skip ? segs : [...segs, name]);
      } else if (name === "page.tsx") {
        const pattern = segs.map((s) => (s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
        out.push(new RegExp(`^/${pattern}$`));
      }
    }
  };
  walk(root, []);
  return out;
}

describe("Hilfe-Center: Inhalte", () => {
  it("hat eindeutige Bereiche und Anker", () => {
    const cats = HELP_CATEGORIES.map((c) => c.id);
    expect(new Set(cats).size).toBe(cats.length);
    const ids = HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...cats, ...ids]) expect(id).toMatch(/^[a-z0-9-]+$/);
    for (const c of HELP_CATEGORIES) expect(c.articles.length).toBeGreaterThan(0);
  });

  it("setzt alle Platzhalter ein und schreibt Schweizer Hochdeutsch", () => {
    for (const c of HELP_CATEGORIES) {
      for (const a of c.articles) {
        for (const t of [fillHelp(a.q, vars), articleAnswer(a, vars, false), articleAnswer(a, vars, true)]) {
          expect(t, `${c.id}#${a.id}`).not.toMatch(/\{\w+\}/);
          expect(t, `${c.id}#${a.id}`).not.toContain("ß");
        }
      }
      expect(c.summary).not.toContain("ß");
    }
  });

  it("verlinkt nur auf Seiten, die es gibt (inkl. Anker im Hilfe-Center)", () => {
    const routes = appRoutes();
    const links = HELP_CATEGORIES.flatMap((c) => [
      ...c.links.map((l) => ({ from: c.id, href: l.href })),
      ...c.articles.flatMap((a) => [...`${a.a}\n${a.inApp ?? ""}`.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => ({ from: `${c.id}#${a.id}`, href: m[1]! }))),
    ]);
    expect(links.length).toBeGreaterThan(40);
    for (const { from, href } of links) {
      const [pathname, hash] = href.split("#") as [string, string | undefined];
      expect(routes.some((r) => r.test(pathname)), `${from} → ${href}`).toBe(true);
      const help = /^\/hilfe\/([a-z0-9-]+)$/.exec(pathname);
      if (help) {
        const cat = HELP_CATEGORIES.find((c) => c.id === help[1]);
        expect(cat, `${from} → ${href}`).toBeTruthy();
        if (hash) expect(cat!.articles.some((a) => a.id === hash), `${from} → ${href}`).toBe(true);
      }
    }
  });

  it("zeigt in der iOS-App keine Web-Preise für Creator Pro", () => {
    const pro = HELP_CATEGORIES.flatMap((c) => c.articles).find((a) => a.id === "creator-pro")!;
    expect(articleAnswer(pro, vars, false)).toContain("CHF 9.00");
    expect(articleAnswer(pro, vars, true)).not.toMatch(/CHF|\/studio\/pro/);
  });

  it("entfernt Auszeichnungen für Suche und Vorschau", () => {
    expect(plainHelp("Unter [Einstellungen → Profil](/einstellungen/profil) **jetzt**\n- eins\n- zwei")).toBe("Unter Einstellungen → Profil jetzt eins zwei");
  });
});

describe("Hilfe-Center: Suche", () => {
  const ids = (q: string) => searchHelp(index, q).map((r) => r.id);

  it("findet Gutscheine zum Einlösen und zum Erstellen", () => {
    const r = ids("Gutschein");
    expect(r).toContain("gutschein-einloesen");
    expect(r).toContain("gutscheine-erstellen");
  });

  it("ignoriert Umlaute und Gross-/Kleinschreibung", () => {
    expect(normalizeHelp("Rückgabe")).toBe(normalizeHelp("rueckgabe"));
    expect(ids("ruckgabe")).toContain("stornieren");
    expect(ids("ZWEI-FAKTOR")[0]).toBe("zwei-faktor");
  });

  it("verlangt alle Wörter und gewichtet Treffer in der Frage", () => {
    expect(ids("euro bezahlen").slice(0, 3)).toContain("waehrung");
    expect(ids("welche währung bezahle ich")[0]).toBe("waehrung");
    expect(ids("chat löschen")).toContain("chat-loeschen");
    expect(ids("gutschein zuschnitt")).toEqual([]);
    expect(ids("xyzzy")).toEqual([]);
    expect(ids("  ")).toEqual([]);
  });
});
