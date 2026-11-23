import { expect, test } from "@playwright/test";
import { confirmDialog, loginAs, one, runServer, sql, userId } from "./helpers";

/**
 * Creator Pro: Newsletter an Follower:innen – schreiben, senden, zustellen (Worker), Öffnung zählen,
 * per Link abbestellen und auf dem Profil wieder abonnieren.
 */
test.describe.serial("Creator-Newsletter", () => {
  let mattia = "";
  let elias = "";
  let hadSub = false;

  test.beforeAll(async () => {
    mattia = await userId("mattia");
    elias = await userId("elias");
    hadSub = !!(await one(`SELECT 1 FROM "Subscription" WHERE "userId" = $1`, [mattia]));
    if (!hadSub) await sql(`INSERT INTO "Subscription" (id, "userId", interval, status, provider, "updatedAt") VALUES ($1, $2, 'comp', 'active', 'comp', now())`, [`e2e_sub_${Date.now()}`, mattia]);
    await sql(`INSERT INTO "Follow" ("followerId", "followeeId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [elias, mattia]);
    await sql(`DELETE FROM "NewsletterOptOut" WHERE "creatorId" = $1`, [mattia]);
    await sql(`DELETE FROM "CreatorNewsletter" WHERE "authorId" = $1`, [mattia]);
    await sql(`UPDATE "UserPreference" SET "notificationPrefs" = "notificationPrefs" - 'creatorNewsletters' WHERE "userId" = $1`, [elias]);
  });

  test.afterAll(async () => {
    await sql(`DELETE FROM "CreatorNewsletter" WHERE "authorId" = $1`, [mattia]);
    await sql(`DELETE FROM "NewsletterOptOut" WHERE "creatorId" = $1`, [mattia]);
    if (!hadSub) await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp' AND id LIKE 'e2e_sub_%'`, [mattia]);
  });

  test("schreiben, senden, zustellen, Öffnung zählen", async ({ browser }) => {
    const page = await loginAs(browser, "mattia");
    await page.goto("/studio/newsletter");
    await expect(page.getByRole("heading", { name: "Newsletter", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Neuer Newsletter/ }).first().click();
    await expect(page).toHaveURL(/\/studio\/newsletter\/neu$/);
    await page.getByLabel("Betreff").fill("E2E Neu in der Werkstatt");
    await page.getByLabel("Text").fill("Hallo zusammen\n\nDiese Woche ist ein neuer Melkschemel aus Arve entstanden.\n\nHerzlich, Mattia");
    // Vorschau im Postfach zeigt Betreff und Absender
    const preview = page.getByRole("complementary", { name: "Vorschau" });
    await expect(preview).toContainText("E2E Neu in der Werkstatt");
    await expect(preview).toContainText("Newsletter von Mattia Rossi");

    await page.getByRole("button", { name: "Jetzt senden" }).click();
    await expect(confirmDialog(page)).toContainText(/Person/);
    await confirmDialog(page).getByRole("button", { name: "Jetzt senden" }).click();
    await expect(page).toHaveURL(/\/studio\/newsletter$/, { timeout: 20_000 });
    await expect(page.locator("main")).toContainText("E2E Neu in der Werkstatt");

    const n = await one<{ id: string; status: string }>(`SELECT id, status FROM "CreatorNewsletter" WHERE "authorId" = $1 AND subject = 'E2E Neu in der Werkstatt'`, [mattia]);
    expect(n?.status).toBe("SCHEDULED");

    // Worker: Momentaufnahme und Versand
    runServer(`import("./src/server/pro/newsletter").then((m) => m.processDueNewsletters({ now: new Date(Date.now() + 5000) }))`);
    const after = await one<{ status: string; recipientCount: number }>(`SELECT status, "recipientCount" FROM "CreatorNewsletter" WHERE id = $1`, [n!.id]);
    expect(after?.status).toBe("SENT");
    expect(after?.recipientCount).toBeGreaterThanOrEqual(1);
    const d = await one<{ id: string; sentAt: Date | null }>(`SELECT id, "sentAt" FROM "NewsletterDelivery" WHERE "newsletterId" = $1 AND "userId" = $2`, [n!.id, elias]);
    expect(d?.sentAt).not.toBeNull();

    // Öffnungs-Pixel: zählt einmal
    const token = runServer(`import("./src/server/pro/newsletter").then((m) => console.log("TOKEN=" + m.deliveryToken("${d!.id}")))`).match(/TOKEN=(\S+)/)![1];
    for (let i = 0; i < 2; i++) {
      const r = await page.request.get(`/api/newsletter/geoeffnet?t=${token}`);
      expect(r.headers()["content-type"]).toContain("image/gif");
    }
    expect((await one<{ openCount: number }>(`SELECT "openCount" FROM "CreatorNewsletter" WHERE id = $1`, [n!.id]))?.openCount).toBe(1);

    // Klick-Link leitet nur auf http(s) weiter
    const click = await page.request.get(`/api/newsletter/klick?t=${token}&u=${encodeURIComponent("/u/mattia.holz")}`, { maxRedirects: 0 });
    expect(click.status()).toBe(302);
    expect(click.headers()["location"]).toContain("/u/mattia.holz");
    const evil = await page.request.get(`/api/newsletter/klick?t=${token}&u=${encodeURIComponent("javascript:alert(1)")}`, { maxRedirects: 0 });
    expect(evil.headers()["location"]).not.toContain("javascript");

    // Melden über den Link aus der Mail (ohne Anmeldung): Moderationsfall gegen die Absenderin
    await sql(`DELETE FROM "Report" WHERE "reporterId" = $1 AND "targetType" = 'USER' AND "targetId" = $2`, [elias, mattia]);
    const anon = await browser.newPage();
    await anon.goto(`/newsletter-melden?t=${token}`);
    await expect(anon.getByRole("heading", { name: "Newsletter melden" })).toBeVisible();
    await anon.getByText("Spam oder Werbung").click();
    await anon.getByRole("button", { name: "Newsletter melden" }).click();
    await expect(anon.getByText(/deine Meldung ist bei unserem Moderationsteam/)).toBeVisible();
    const rep = await one<{ details: string }>(`SELECT details FROM "Report" WHERE "reporterId" = $1 AND "targetType" = 'USER' AND "targetId" = $2`, [elias, mattia]);
    expect(rep?.details).toContain(`Newsletter „`);
    await sql(`DELETE FROM "Report" WHERE "reporterId" = $1 AND "targetType" = 'USER' AND "targetId" = $2`, [elias, mattia]);
    await anon.goto(`/newsletter-melden?t=ungueltig.abc`);
    await expect(anon.getByRole("heading", { name: "Link ungültig" })).toBeVisible();
    await anon.close();

    // Verschickt: nicht mehr änderbar
    await page.goto(`/studio/newsletter/${n!.id}`);
    await expect(page.getByText("Dieser Newsletter ist verschickt")).toBeVisible();
    await expect(page.getByLabel("Betreff")).toBeDisabled();
  });

  test("abbestellen per Link, auf dem Profil wieder abonnieren", async ({ browser }) => {
    const token = runServer(`import("./src/server/pro/newsletter").then((m) => console.log("TOKEN=" + m.unsubscribeToken("${elias}", "${mattia}")))`).match(/TOKEN=(\S+)/)![1];
    const anon = await browser.newPage();
    await anon.goto(`/newsletter-abbestellen?t=${token}`);
    await expect(anon.getByRole("heading", { name: "Newsletter abbestellen" })).toBeVisible();
    await anon.getByRole("button", { name: "Newsletter abbestellen" }).click();
    await expect(anon.getByText(/keinen Newsletter von Mattia Rossi mehr/)).toBeVisible();
    expect(await one(`SELECT 1 AS x FROM "NewsletterOptOut" WHERE "userId" = $1 AND "creatorId" = $2`, [elias, mattia])).toBeTruthy();

    // Ungültiger Link
    await anon.goto(`/newsletter-abbestellen?t=${token.slice(0, -2)}xx`);
    await expect(anon.getByRole("heading", { name: "Link ungültig" })).toBeVisible();

    const page = await loginAs(browser, "elias");
    await page.goto("/u/mattia.holz");
    const btn = page.getByRole("button", { name: "Newsletter abonnieren" });
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(page.getByRole("button", { name: "Newsletter abonniert" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => !!(await one(`SELECT 1 AS x FROM "NewsletterOptOut" WHERE "userId" = $1 AND "creatorId" = $2`, [elias, mattia]))).toBe(false);

    // Abmelden ohne Anmeldung (RFC 8058, POST)
    const r = await anon.request.post(`/api/newsletter/abbestellen?t=${token}`);
    expect(r.status()).toBe(200);
  });
});
