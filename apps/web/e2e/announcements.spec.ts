import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser } from "@playwright/test";
import { one, sql } from "./helpers";

/**
 * Ankündigungen: Admin legt eine an (WYSIWYG + Emoji), sie erscheint oben auf der Werkbank
 * und der Startseite für Gäste und lässt sich ausblenden. Admin-Sitzung wie in admin.spec.ts.
 */

async function adminContext(browser: Browser) {
  const admin = (await one<{ id: string; totp: Date | null }>(`SELECT id, "totpEnabledAt" totp FROM "User" WHERE role = 'SUPERADMIN' ORDER BY "createdAt" LIMIT 1`))!;
  if (!admin.totp) await sql(`UPDATE "User" SET "totpEnabledAt" = now() WHERE id = $1`, [admin.id]);
  const raw = randomBytes(32).toString("base64url");
  await sql(`INSERT INTO "Session" (id, "userId", "expiresAt", "mfaPending", "mfaVerifiedAt", "createdAt", "lastUsedAt") VALUES ($1, $2, now() + interval '1 hour', false, now(), now(), now())`, [createHash("sha256").update(raw).digest("hex"), admin.id]);
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "wr_session", value: raw, url: process.env.E2E_BASE_URL ?? "http://localhost:3100" }]);
  return { ctx, restore: async () => !admin.totp && (await sql(`UPDATE "User" SET "totpEnabledAt" = NULL WHERE id = $1`, [admin.id])) };
}

test("Ankündigung anlegen, auf Werkbank und Startseite sehen, ausblenden", async ({ browser }) => {
  const title = `E2E Ankündigung ${Date.now()}`;
  const { ctx, restore } = await adminContext(browser);
  try {
    const page = await ctx.newPage();
    await page.goto("/admin/ankuendigungen/neu");
    await page.getByRole("textbox", { name: "Titel" }).fill(title);

    await page.getByRole("button", { name: "Symbol wählen" }).click();
    await page.getByPlaceholder("Suchen, z. B. Herz, Party, Wolle").fill("party");
    await page.getByRole("dialog", { name: "Emojis" }).getByRole("button").first().click();

    const editor = page.locator("[contenteditable=true]");
    await editor.click();
    await page.keyboard.type("Heute ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("wichtig");
    await page.keyboard.press("ControlOrMeta+b");

    await page.getByRole("radio", { name: /Schiefer/ }).click();
    await page.getByRole("textbox", { name: "Beschriftung" }).fill("Zum Markt");
    await page.getByRole("textbox", { name: "Link-Adresse" }).fill("javascript:alert(1)");
    await page.locator("#main").getByText("Startseite für Gäste", { exact: true }).click();
    await page.locator("#main").getByRole("checkbox", { name: /^Aktiv/ }).check();

    // Unsicherer Link wird abgewiesen
    await page.getByRole("button", { name: "Ankündigung anlegen" }).click();
    await expect(page.getByText("Interne Adresse (/…) oder https://…")).toBeVisible();
    await page.getByRole("textbox", { name: "Link-Adresse" }).fill("/markt");
    await page.getByRole("button", { name: "Ankündigung anlegen" }).click();
    await expect(page).toHaveURL(/\/admin\/ankuendigungen\/(?!neu)[a-z0-9]+$/);

    const row = (await one<{ id: string; body: string; tone: string; emoji: string; placements: string[] }>(`SELECT id, body, tone, emoji, placements FROM "Announcement" WHERE title = $1`, [title]))!;
    expect(row.body).toBe("Heute **wichtig**");
    expect(row.tone).toBe("slate");
    expect(row.emoji).not.toBe("");
    expect(row.placements.sort()).toEqual(["feed", "landing"]);
    expect(await one(`SELECT 1 FROM "AuditEvent" WHERE action = 'admin.announcement_created' AND "targetId" = $1`, [row.id])).toBeTruthy();

    // Werkbank (angemeldet)
    await page.goto("/feed");
    const banner = page.getByRole("region", { name: `Ankündigung: ${title}` });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: /Zum Markt/ })).toHaveAttribute("href", "/markt");

    // Startseite (Gast): ausblenden bleibt nach dem Neuladen
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto("/");
    const gb = g.getByRole("region", { name: `Ankündigung: ${title}` });
    await expect(gb).toBeVisible();
    await gb.getByRole("button", { name: "Ankündigung ausblenden" }).click();
    await expect(gb).toBeHidden();
    await g.reload();
    await expect(g.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(gb).toBeHidden();
    await guest.close();

    // Ausschalten: verschwindet
    await sql(`UPDATE "Announcement" SET "isActive" = false WHERE id = $1`, [row.id]);
    await page.goto("/feed");
    await expect(page.getByRole("region", { name: `Ankündigung: ${title}` })).toBeHidden();
    await sql(`DELETE FROM "Announcement" WHERE id = $1`, [row.id]);
  } finally {
    await ctx.close();
    await restore();
  }
});

test("Gestaltung: Bild, Schrift, Grösse und Schriftfarbe werden gespeichert und angezeigt", async ({ browser }) => {
  const title = `E2E Gestaltung ${Date.now()}`;
  const { ctx, restore } = await adminContext(browser);
  try {
    const page = await ctx.newPage();
    await page.goto("/admin/ankuendigungen/neu");
    await page.getByRole("textbox", { name: "Titel" }).fill(title);

    await page.getByRole("radio", { name: "Bild" }).click();
    await page.locator("input[type=file]").setInputFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/foto.jpg"));
    await expect(page.getByRole("img", { name: "Gewähltes Hintergrundbild" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("radiogroup", { name: "Schriftart Titel" }).getByRole("radio", { name: /Serif/ }).click();
    await page.getByRole("radiogroup", { name: "Grösse Titel" }).getByRole("radio", { name: "XL", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Schriftfarbe" }).getByRole("radio", { name: "#F2D58A" }).click();
    // Gelb auf dem Bild reicht nicht → „Lesbar machen“ dunkelt stärker ab und behält die Farbe
    const fix = page.getByRole("button", { name: "Lesbar machen" });
    if (await fix.isVisible()) await fix.click();
    await expect(page.getByText("– gut lesbar.")).toBeVisible();
    await page.locator("#main").getByRole("checkbox", { name: /^Aktiv/ }).check();
    await page.getByRole("button", { name: "Ankündigung anlegen" }).click();
    await expect(page).toHaveURL(/\/admin\/ankuendigungen\/(?!neu)[a-z0-9]+$/);

    const row = (await one<{ id: string; titleFont: string; titleSize: string; textColor: string; bgMode: string; bgImageUrl: string | null; bgMediaId: string | null }>(
      `SELECT id, "titleFont", "titleSize", "textColor", "bgMode", "bgImageUrl", "bgMediaId" FROM "Announcement" WHERE title = $1`,
      [title],
    ))!;
    expect(row).toMatchObject({ titleFont: "serif", titleSize: "xl", textColor: "#F2D58A", bgMode: "image" });
    expect(row.bgImageUrl).toBeTruthy();
    // Medium ist als verwendet markiert (Bereinigung lässt es stehen)
    expect(await one(`SELECT 1 FROM "Media" WHERE id = $1 AND "attachedAt" IS NOT NULL`, [row.bgMediaId])).toBeTruthy();

    await page.goto("/feed");
    const banner = page.getByRole("region", { name: `Ankündigung: ${title}` });
    await expect(banner).toBeVisible();
    await expect(banner.locator("img")).toHaveAttribute("src", row.bgImageUrl!);
    await expect(banner.getByRole("heading")).toHaveCSS("color", "rgb(242, 213, 138)");
    expect(await banner.getByRole("heading").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Fraunces");
    await sql(`DELETE FROM "Announcement" WHERE id = $1`, [row.id]);
  } finally {
    await ctx.close();
    await restore();
  }
});
