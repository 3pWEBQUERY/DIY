import { expect, request as pwRequest, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * App-Schnittstellen für die iOS-Parität bei Anleitungen: Richtpreise der Materialzeilen (costMinor) hin
 * und zurück, Druckfassung mit `Authorization: Bearer` (so lädt die App das PDF) und PDF-Branding (Pro).
 */
test.describe.serial("App: Kostenschätzung, Druckfassung, PDF-Branding", () => {
  let mattia = "";
  let tutorialId = "";
  let slug = "";
  test.beforeAll(async () => {
    mattia = await userId("mattia");
  });
  test.afterAll(async () => {
    await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp'`, [mattia]);
    await sql(`UPDATE "UserProfile" SET "pdfBrand" = NULL WHERE "userId" = $1`, [mattia]);
    if (tutorialId) await sql(`DELETE FROM "Tutorial" WHERE id = $1`, [tutorialId]);
  });

  test("Materialpreise: Feldfehler, speichern, Bearbeiten-Daten und Anleitungsseite", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    const tag = Date.now().toString(36);
    const input = (materials: unknown[]) => ({ title: `E2E Preise ${tag}`, summary: "Mit Richtpreisen", category: "holz", steps: [{ title: "Zuschnitt", body: "Bretter zuschneiden", minutes: 5 }], materials, shareToFeed: false });

    // Ungültiger Preis → Feldfehler an der Zeile
    const bad = await page.request.post("/api/v1/app/tutorials", { data: { publish: false, input: input([{ name: "Brett", quantity: "2 Stk", note: "", costMinor: -5 }]) } });
    expect(bad.status()).toBe(422);
    expect(Object.keys((await bad.json()).error.fields ?? {}).some((k) => k.startsWith("materials.0"))).toBe(true);

    const res = await page.request.post("/api/v1/app/tutorials", {
      data: { publish: true, input: input([{ name: "Fichtenbrett", quantity: "2 Stk", note: "", costMinor: 1250 }, { name: "Holzleim", quantity: "1", note: "", costMinor: 790 }, { name: "Schrauben", quantity: "8", note: "" }]) },
    });
    expect(res.status(), await res.text()).toBe(200);
    tutorialId = (await res.json()).data.id;
    slug = (await one<{ slug: string }>(`SELECT slug FROM "Tutorial" WHERE id = $1`, [tutorialId]))!.slug;

    // Bearbeiten-Daten liefern die Preise in der Währung der Autorin bzw. des Autors zurück
    const edit = (await (await page.request.get(`/api/v1/app/tutorials/${tutorialId}/edit`)).json()).data;
    expect(edit.values.materials.map((m: { costMinor?: number }) => m.costMinor ?? null)).toEqual([1250, 790, null]);

    // Anleitungsseite: Preise und Währung (`costCurrency`) für die Summe „ab …“ (eine Zeile ohne Preis)
    const view = (await (await page.request.get(`/api/v1/app/tutorials/by-slug/${slug}`)).json()).data;
    expect(view.costCurrency).toMatch(/^(CHF|EUR)$/);
    expect(view.materials[0].costMinor).toBeGreaterThan(0);
    expect(view.materials[2].costMinor ?? null).toBeNull();

    // Zeile ohne Preis speichern löscht den Preis (PUT)
    const put = await page.request.put(`/api/v1/app/tutorials/${tutorialId}`, { data: { publish: false, input: input([{ name: "Fichtenbrett", quantity: "2 Stk", note: "" }]) } });
    expect(put.status(), await put.text()).toBe(200);
    const edit2 = (await (await page.request.get(`/api/v1/app/tutorials/${tutorialId}/edit`)).json()).data;
    expect(edit2.values.materials[0].costMinor ?? null).toBeNull();
    await page.context().close();
  });

  test("Druckfassung mit Bearer-Token wie in der App", async ({ browser, baseURL }) => {
    const page = await loginAs(browser, "mattia");
    const token = (await page.context().cookies()).find((c) => c.name === "wr_session")?.value;
    expect(token).toBeTruthy();
    await page.context().close();

    const app = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const res = await app.get(`/anleitungen/${slug}/drucken?app=ios&bilder=0`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("print-doc");
    expect(html).toContain(`E2E Preise`);
    await app.dispose();
  });

  test("PDF-Branding: ohne Pro gesperrt, mit Pro speichern, prüfen, zurücksetzen", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp'`, [mattia]);
    await sql(`UPDATE "UserProfile" SET "pdfBrand" = NULL WHERE "userId" = $1`, [mattia]);

    const before = (await (await page.request.get("/api/v1/app/studio/pdf-brand")).json()).data;
    expect(before.isPro).toBe(false);
    expect(before.brand).toBeNull();
    expect(before.defaults.name).toBeTruthy();
    expect(before.preview?.slug).toBeTruthy();
    const locked = await page.request.put("/api/v1/app/studio/pdf-brand", { data: { name: "Bottega App", link: "" } });
    expect(locked.status()).toBe(403);

    await sql(
      `INSERT INTO "Subscription" (id, "userId", plan, interval, status, provider, "updatedAt") VALUES ($1, $2, 'PRO', 'month', 'active', 'comp', now())
       ON CONFLICT ("userId") DO UPDATE SET status = 'active', provider = 'comp', "currentPeriodEnd" = NULL`,
      [`e2e_sub_print_${Date.now()}`, mattia],
    );
    expect((await (await page.request.get("/api/v1/app/studio/pdf-brand")).json()).data.isPro).toBe(true);

    // Feldfehler wie im Web: Link nur mit https://
    const bad = await page.request.put("/api/v1/app/studio/pdf-brand", { data: { name: "", link: "http://bottega.example" } });
    expect(bad.status()).toBe(422);
    const fields = (await bad.json()).error.fields;
    expect(fields.name).toBeTruthy();
    expect(fields.link).toContain("https://");

    // Fremdes oder unbekanntes Logo wird abgelehnt
    const foreign = await page.request.put("/api/v1/app/studio/pdf-brand", { data: { name: "Bottega App", link: "", logoMediaId: "unbekannt" } });
    expect(foreign.status()).toBe(403);

    const ok = await page.request.put("/api/v1/app/studio/pdf-brand", { data: { name: "Bottega App", link: "https://bottega.example" } });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).data.brand).toMatchObject({ name: "Bottega App", link: "https://bottega.example", logoUrl: null });
    const saved = (await (await page.request.get("/api/v1/app/studio/pdf-brand")).json()).data;
    expect(saved.brand.name).toBe("Bottega App");

    // Druckfassung zeigt das Branding
    const anon = await browser.newPage();
    await anon.goto(`/anleitungen/${saved.preview.slug}/drucken`);
    await expect(anon.getByTestId("pdf-brand-footer")).toContainText("Bottega App");
    await anon.close();

    const cleared = await page.request.delete("/api/v1/app/studio/pdf-brand");
    expect(cleared.status()).toBe(200);
    expect((await (await page.request.get("/api/v1/app/studio/pdf-brand")).json()).data.brand).toBeNull();
    await page.context().close();
  });
});
