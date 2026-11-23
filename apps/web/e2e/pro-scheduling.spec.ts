import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

/**
 * Creator Pro: Projekte und Anleitungen geplant veröffentlichen (Worker), Inhaltskalender,
 * PDF-Branding der Druckfassung. Mattia erhält für den Test ein geschenktes Abo.
 */
test.describe.serial("Creator Pro – Planung & PDF-Branding", () => {
  let mattia = "";
  test.beforeAll(async () => {
    mattia = await userId("mattia");
    await sql(
      `INSERT INTO "Subscription" (id, "userId", plan, interval, status, provider, "updatedAt") VALUES ($1, $2, 'PRO', 'month', 'active', 'comp', now())
       ON CONFLICT ("userId") DO UPDATE SET status = 'active', provider = 'comp', "currentPeriodEnd" = NULL`,
      [`e2e_sub_${Date.now()}`, mattia],
    );
  });
  test.afterAll(async () => {
    await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp'`, [mattia]);
    await sql(`UPDATE "UserProfile" SET "pdfBrand" = NULL WHERE "userId" = $1`, [mattia]);
  });

  test("Anleitung geplant: bleibt Entwurf, der Worker veröffentlicht zum Termin", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    const tag = Date.now().toString(36);
    const at = new Date(Date.now() + 2 * 3600_000).toISOString();
    const res = await page.request.post("/api/v1/app/tutorials", {
      data: { publish: true, input: { title: `E2E Geplant ${tag}`, summary: "Geplante Anleitung", category: "holz", steps: [{ title: "Zuschnitt", body: "Bretter zuschneiden" }], shareToFeed: false, publishAt: at } },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    const r = body.data ?? body;
    expect(r.version).toBeNull();
    expect(r.scheduledAt).toBe(at);
    const row = await one<{ state: string; scheduledAt: Date | null; currentVersionId: string | null; slug: string }>(`SELECT state, "scheduledAt", "currentVersionId", slug FROM "Tutorial" WHERE id = $1`, [r.id]);
    expect(row).toMatchObject({ state: "DRAFT", currentVersionId: null });

    const anon = await browser.newPage();
    expect((await anon.goto(`/anleitungen/${row!.slug}`))?.status()).toBe(404);

    // Kalender zeigt den Termin
    await page.goto("/studio/kalender");
    await expect(page.locator("main")).toContainText(`E2E Geplant ${tag}`);

    // Termin erreicht → Worker veröffentlicht über den normalen Weg (Version 1)
    await sql(`UPDATE "Tutorial" SET "scheduledAt" = now() - interval '1 minute' WHERE id = $1`, [r.id]);
    runServer(`import("./src/server/tutorials/service").then((m) => m.publishScheduledTutorials())`);
    const after = await one<{ state: string; scheduledAt: Date | null; currentVersionId: string | null }>(`SELECT state, "scheduledAt", "currentVersionId" FROM "Tutorial" WHERE id = $1`, [r.id]);
    expect(after!.state).toBe("PUBLISHED");
    expect(after!.currentVersionId).not.toBeNull();
    expect(after!.scheduledAt).toBeNull();
    expect((await anon.goto(`/anleitungen/${row!.slug}`))?.status()).toBe(200);

    // PDF-Branding in der Druckfassung
    await sql(`UPDATE "UserProfile" SET "pdfBrand" = $2::jsonb WHERE "userId" = $1`, [mattia, JSON.stringify({ name: "Bottega E2E", link: "https://bottega.example" })]);
    await anon.goto(`/anleitungen/${row!.slug}/drucken`);
    await expect(anon.getByTestId("pdf-brand-footer")).toContainText("Bottega E2E");
    await expect(anon.locator("article")).toContainText("erstellt mit Werkuno");
    await anon.close();
  });

  test("Projekt geplant: unsichtbar bis zum Termin, dann veröffentlicht", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    const tag = Date.now().toString(36);
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await page.request.post("/api/v1/app/projects", { data: { title: `E2E Projekt geplant ${tag}`, category: "holz", publishAt: at } });
    expect(res.status(), await res.text()).toBe(200);
    const j = await res.json();
    const r = j.data ?? j;
    const row = await one<{ state: string; publishedAt: Date | null }>(`SELECT state, "publishedAt" FROM "Project" WHERE id = $1`, [r.id]);
    expect(row).toMatchObject({ state: "DRAFT", publishedAt: null });

    await sql(`UPDATE "Project" SET "scheduledAt" = now() - interval '1 minute' WHERE id = $1`, [r.id]);
    runServer(`import("./src/server/projects/service").then((m) => m.publishScheduledProjects())`);
    const after = await one<{ state: string; publishedAt: Date | null; scheduledAt: Date | null }>(`SELECT state, "publishedAt", "scheduledAt" FROM "Project" WHERE id = $1`, [r.id]);
    expect(after!.state).toBe("PUBLISHED");
    expect(after!.publishedAt).not.toBeNull();
    expect(after!.scheduledAt).toBeNull();
    await sql(`UPDATE "Project" SET state = 'REMOVED' WHERE id = $1`, [r.id]);
  });

  test("Ohne Pro: Planen von Projekten nicht möglich, Kalender zeigt Hinweis", async ({ browser }) => {
    const page = await loginAs(browser, "elias");
    const res = await page.request.post("/api/v1/app/projects", { data: { title: "E2E ohne Pro", category: "holz", publishAt: new Date(Date.now() + 3600_000).toISOString() } });
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain("Creator Pro");
    await page.goto("/studio/kalender");
    await expect(page.locator("main")).toContainText("Creator Pro ansehen");
  });

  test("PDF-Branding im Studio speichern", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    await page.goto("/studio/einstellungen");
    await page.getByLabel("Name im Kopf").fill("Bottega Mattia");
    await page.getByLabel("Link").fill("http://unsicher.example");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText(/https:\/\//).first()).toBeVisible();
    await page.getByLabel("Link").fill("https://bottega.example");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText("PDF-Branding gespeichert.")).toBeVisible();
    const p = await one<{ brand: { name: string; link: string } }>(`SELECT "pdfBrand" AS brand FROM "UserProfile" WHERE "userId" = $1`, [mattia]);
    expect(p!.brand).toMatchObject({ name: "Bottega Mattia", link: "https://bottega.example" });
  });
});
