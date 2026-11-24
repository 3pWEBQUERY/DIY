import { expect, test, type APIResponse } from "@playwright/test";
import { decodeState } from "../src/lib/zuschnitt";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * App-Parität C: Studio-Statistiken mit Zeitraum und CSV-Export, Inhaltskalender und
 * Zuschnittrechner über die Mobile-API (/api/v1/app).
 */
const data = async <T = Record<string, unknown>>(res: APIResponse): Promise<T> => {
  const j = await res.json();
  return (j.data ?? j) as T;
};

test.describe.serial("App-Parität C", () => {
  let mattia = "";
  test.beforeAll(async () => {
    mattia = await userId("mattia");
    await sql(
      `INSERT INTO "Subscription" (id, "userId", plan, interval, status, provider, "updatedAt") VALUES ($1, $2, 'PRO', 'month', 'active', 'comp', now())
       ON CONFLICT ("userId") DO UPDATE SET status = 'active', provider = 'comp', "currentPeriodEnd" = NULL`,
      [`e2e_sub_c_${Date.now()}`, mattia],
    );
  });
  test.afterAll(async () => {
    await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp'`, [mattia]);
  });

  test("Statistiken: Zeitraum, Verläufe und CSV-Export nur mit Pro", async ({ browser }) => {
    const elias = await userId("elias");
    const eliasPro = await one(`SELECT 1 AS x FROM "Subscription" WHERE "userId" = $1 AND status <> 'canceled'`, [elias]);
    test.skip(!!eliasPro, "Elias hat ein Abo – Vergleich ohne Pro nicht möglich");

    const pro = await loginAs(browser, "mattia");
    const week = await data<{ weeks: string[]; totals: number[]; trends: Record<string, number[]>; range: string; canExport: boolean; projects: { id: string }[] }>(
      await pro.request.get("/api/v1/app/studio/stats"),
    );
    expect(week.range).toBe("wochen");
    expect(week.weeks).toHaveLength(12);
    expect(week.totals).toHaveLength(12);
    expect(week.canExport).toBe(true);
    for (const p of week.projects) expect(week.trends[p.id]).toHaveLength(12);

    const year = await data<{ weeks: string[]; range: string }>(await pro.request.get("/api/v1/app/studio/stats?range=jahr"));
    expect(year.range).toBe("jahr");
    expect(year.weeks).toHaveLength(52);

    const exp = await pro.request.get("/api/v1/app/studio/stats/export?range=jahr");
    expect(exp.status(), await exp.text()).toBe(200);
    const csv = await data<{ filename: string; csv: string }>(exp);
    expect(csv.filename).toMatch(/\.csv$/);
    expect(csv.csv.split("\n")[0]).toContain(";");

    // Ohne Pro: immer 12 Wochen, kein Export
    const free = await loginAs(browser, "elias");
    const f = await data<{ weeks: string[]; range: string; canExport: boolean }>(await free.request.get("/api/v1/app/studio/stats?range=jahr"));
    expect(f.range).toBe("wochen");
    expect(f.weeks).toHaveLength(12);
    expect(f.canExport).toBe(false);
    expect((await free.request.get("/api/v1/app/studio/stats/export")).status()).toBe(403);
  });

  test("Inhaltskalender: Monat und Woche mit vor/zurück, ohne Pro gesperrt", async ({ browser }) => {
    const pro = await loginAs(browser, "mattia");
    const tag = Date.now().toString(36);
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const created = await pro.request.post("/api/v1/app/projects", { data: { title: `E2E Kalender ${tag}`, category: "holz", publishAt: at } });
    expect(created.status(), await created.text()).toBe(200);
    const project = await data<{ id: string }>(created);

    type Cal = { view: string; month: string; week: string; prev: string; next: string; today: string; todayWeek: string; days: { day: string; inMonth: boolean; items: { id: string; title: string; scheduled: boolean }[] }[]; upcoming: { title: string }[] };
    const month = await data<Cal>(await pro.request.get("/api/v1/app/studio/calendar?view=month"));
    expect(month.view).toBe("month");
    expect(month.days.length % 7).toBe(0);
    expect(month.prev).toMatch(/^\d{4}-\d{2}$/);
    expect(month.upcoming.some((u) => u.title === `E2E Kalender ${tag}`)).toBe(true);

    const back = await data<Cal>(await pro.request.get(`/api/v1/app/studio/calendar?view=month&month=${month.prev}`));
    expect(back.month).toBe(month.prev);
    expect(back.next).toBe(month.month);

    const wk = await data<Cal>(await pro.request.get(`/api/v1/app/studio/calendar?view=week&week=${month.todayWeek}`));
    expect(wk.view).toBe("week");
    expect(wk.days).toHaveLength(7);
    expect(wk.prev).toMatch(/^\d{4}-W\d{2}$/);
    // Der geplante Termin liegt in zwei Tagen: in dieser oder der nächsten Woche
    const next = await data<Cal>(await pro.request.get(`/api/v1/app/studio/calendar?view=week&week=${wk.next}`));
    const items = [...wk.days, ...next.days].flatMap((d) => d.items);
    expect(items.find((i) => i.id === project.id)?.scheduled).toBe(true);

    const free = await loginAs(browser, "elias");
    expect((await free.request.get("/api/v1/app/studio/calendar")).status()).toBe(403);
    // Die freie Liste geplanter Beiträge bleibt erreichbar
    expect((await free.request.get("/api/v1/app/studio/scheduled")).status()).toBe(200);

    await sql(`DELETE FROM "Project" WHERE id = $1`, [project.id]);
  });

  test("Zuschnittrechner: Plan, Teilen-Link, CSV, Einfügen und Prüfung", async ({ request }) => {
    const res = await request.post("/api/v1/app/tools/cutting-plan", {
      data: {
        parts: [
          { name: "Seite", length: 720, width: 560, qty: 2, edgesL: 1 },
          { name: "Riesig", length: 5000, width: 3000, qty: 1 },
        ],
        settings: { boardPrice: 50 },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const r = await data<{ result: { sheets: unknown[]; tooLarge: { name: string }[]; cost: { boards: number } }; csv: string; shareUrl: string; settings: { boardLength: number } }>(res);
    expect(r.result.sheets).toHaveLength(1);
    expect(r.result.tooLarge.map((t) => t.name)).toEqual(["Riesig"]);
    expect(r.result.cost.boards).toBe(50);
    expect(r.settings.boardLength).toBe(2800);
    expect(r.csv).toContain("Seite");
    const code = r.shareUrl.split("#d=")[1]!;
    expect(r.shareUrl).toContain("/werkzeuge/zuschnitt#d=");
    expect(decodeState(code)?.parts.map((p) => p.name)).toEqual(["Seite", "Riesig"]);

    const dec = await data<{ parts: { name: string }[] }>(await request.get(`/api/v1/app/tools/cutting-plan/decode?code=${code}`));
    expect(dec.parts.map((p) => p.name)).toEqual(["Seite", "Riesig"]);
    expect((await request.get("/api/v1/app/tools/cutting-plan/decode?code=kaputt")).status()).toBe(400);

    const parsed = await data<{ parts: { name: string; length: number; qty: number }[] }>(
      await request.post("/api/v1/app/tools/cutting-plan/parse", { data: { text: "Seite; 720; 560; 2\nBoden\t762\t560\t1" } }),
    );
    expect(parsed.parts).toMatchObject([{ name: "Seite", length: 720, qty: 2 }, { name: "Boden", length: 762, qty: 1 }]);

    const bad = await request.post("/api/v1/app/tools/cutting-plan", { data: { parts: [{ name: "x", length: -1, width: 10 }] } });
    expect(bad.status()).toBe(400);
    const empty = await request.post("/api/v1/app/tools/cutting-plan", { data: { parts: [] } });
    expect(empty.status()).toBe(400);
  });
});
