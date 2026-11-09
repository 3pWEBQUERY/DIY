import { expect, test } from "@playwright/test";
import { confirmDialog, failOnNativeDialogs, loginAs, one, sql, userId } from "./helpers";

test("Teilen: eigenes Menü mit WhatsApp, E-Mail, Instagram und Link kopieren", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  failOnNativeDialogs(page);
  await page.goto("/u/lena.haekelt");
  await page.getByRole("button", { name: "Teilen" }).first().click();
  const sheet = page.locator('dialog[aria-labelledby="share-title"]');
  await expect(sheet).toBeVisible();
  expect(await sheet.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=.*u%2Flena\.haekelt/);
  expect(await sheet.getByRole("link", { name: "E-Mail" }).getAttribute("href")).toMatch(/^mailto:\?subject=/);
  await sheet.getByRole("button", { name: "Kopieren" }).click();
  await expect(sheet).toContainText("Kopiert");
  await sheet.getByRole("button", { name: "Instagram" }).click();
  await expect(sheet.getByRole("link", { name: /Instagram öffnen/ })).toBeVisible();
});

test.describe.serial("Koautorenschaft", () => {
  let postId = "";
  test("Einladen → Bestätigen → am Beitrag und im Profil → Austreten", async ({ browser }) => {
    postId = (await one<{ id: string }>(
      `SELECT p.id FROM "Post" p WHERE p."authorId" = $1 AND p.state = 'PUBLISHED' AND p."repostOfId" IS NULL AND p."communityId" IS NULL AND p.visibility = 'PUBLIC' ORDER BY p."publishedAt" DESC LIMIT 1`,
      [await userId("lena")],
    ))!.id;
    await sql(`DELETE FROM "PostCoauthor" WHERE "postId" = $1`, [postId]);

    const lena = await loginAs(browser, "lena");
    await lena.goto(`/beitrag/${postId}`);
    await lena.getByRole("button", { name: "Weitere Aktionen" }).first().click();
    await lena.getByRole("menuitem", { name: "Koautor:innen" }).click();
    const dlg = lena.getByRole("dialog", { name: "Koautor:innen" });
    await dlg.getByRole("textbox", { name: "Personen suchen" }).fill("mattia.holz");
    await dlg.getByRole("textbox", { name: "Personen suchen" }).press("Enter");
    await dlg.getByRole("button", { name: /^Einladen/ }).click();
    await expect(dlg.getByText("Eingeladen", { exact: true })).toBeVisible();

    const mattia = await loginAs(browser, "mattia");
    await mattia.goto("/benachrichtigungen");
    await expect(mattia.locator("main")).toContainText("als Koautor:in eines Beitrags");
    await mattia.goto(`/beitrag/${postId}`);
    await mattia.getByRole("button", { name: "Bestätigen" }).click();
    await expect(mattia.locator("article").first()).toContainText(/Lena Brunner\s+mit\s+Mattia Rossi/);

    const anon = await browser.newPage();
    await anon.goto("/u/mattia.holz?tab=beitraege");
    await expect(anon.locator(`a[href="/beitrag/${postId}"]`).first()).toBeAttached();

    await mattia.getByRole("button", { name: "Weitere Aktionen" }).first().click();
    await mattia.getByRole("menuitem", { name: "Als Koautor:in austreten" }).click();
    await confirmDialog(mattia).getByRole("button", { name: "Austreten" }).click();
    await expect.poll(async () => (await one<{ n: string }>(`SELECT count(*)::text AS n FROM "PostCoauthor" WHERE "postId" = $1`, [postId]))!.n).toBe("0");
  });
});

test("Koautor:innen schon beim Erstellen einladen – Einladung geht mit dem Veröffentlichen raus", async ({ browser }) => {
  const lena = await loginAs(browser, "lena");
  await lena.goto("/erstellen");
  const text = `E2E Koautoren beim Erstellen ${Date.now()}`;
  await lena.getByLabel("Was entsteht gerade bei dir?").fill(text);
  await lena.getByRole("button", { name: /^Koautor:innen/ }).click();
  await lena.getByRole("textbox", { name: "Personen suchen" }).fill("mira.strickt");
  await lena.getByRole("textbox", { name: "Personen suchen" }).press("Enter");
  await lena.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(lena).toHaveURL(/\/beitrag\//);
  const post = await one<{ id: string }>(`SELECT id FROM "Post" WHERE body = $1`, [text]);
  const inv = await one<{ status: string }>(`SELECT status FROM "PostCoauthor" WHERE "postId" = $1`, [post!.id]);
  expect(inv?.status).toBe("PENDING");
  const mira = await loginAs(browser, "mira");
  await mira.goto(`/beitrag/${post!.id}`);
  await expect(mira.getByRole("button", { name: "Bestätigen" })).toBeVisible();
});

test("Benachrichtigungen: Karte für Browser-Push in den Einstellungen", async ({ browser }) => {
  const page = await loginAs(browser, "elias");
  await page.goto("/einstellungen/benachrichtigungen");
  await expect(page.getByText("Push-Benachrichtigungen in diesem Browser")).toBeVisible();
  const r = await page.request.get("/sw.js");
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain("showNotification");
});
