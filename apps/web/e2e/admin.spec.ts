import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { PASSWORD, USERS, confirmDialog, one, sql, userId } from "./helpers";

/**
 * Admin: E-Mail-Adresse eines Kontos ändern. Die Admin-Sitzung wird direkt angelegt (Zwei-Faktor
 * gilt als erledigt) – der Anmeldefluss mit TOTP ist nicht Gegenstand dieses Tests.
 */
async function adminPage(browser: Browser) {
  const admin = (await one<{ id: string; totp: Date | null }>(`SELECT id, "totpEnabledAt" totp FROM "User" WHERE role = 'SUPERADMIN' ORDER BY "createdAt" LIMIT 1`))!;
  if (!admin.totp) await sql(`UPDATE "User" SET "totpEnabledAt" = now() WHERE id = $1`, [admin.id]);
  const raw = randomBytes(32).toString("base64url");
  await sql(`INSERT INTO "Session" (id, "userId", "expiresAt", "mfaPending", "createdAt", "lastUsedAt") VALUES ($1, $2, now() + interval '1 hour', false, now(), now())`, [createHash("sha256").update(raw).digest("hex"), admin.id]);
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "wr_session", value: raw, url: process.env.E2E_BASE_URL ?? "http://localhost:3100" }]);
  return { page: await ctx.newPage(), restore: async () => !admin.totp && (await sql(`UPDATE "User" SET "totpEnabledAt" = NULL WHERE id = $1`, [admin.id])) };
}

test("Admin ändert die E-Mail-Adresse: Anmeldung mit neuer Adresse, alte Links verfallen", async ({ browser }) => {
  const elias = await userId("elias");
  const oldEmail = USERS.elias.email;
  const newEmail = `elias-neu-${Date.now()}@demo.werkraum.local`;
  await sql(`DELETE FROM "RateLimitBucket"`);
  // Offener Passwort-Link an die alte Adresse
  await sql(`INSERT INTO "VerificationToken" (id, "userId", purpose, "expiresAt", "createdAt") VALUES ($1, $2, 'PASSWORD_RESET', now() + interval '1 hour', now())`, [`e2e-reset-${Date.now()}`, elias]);
  const { page, restore } = await adminPage(browser);
  try {
    await page.goto(`/admin/nutzer/${elias}`);
    await page.getByRole("button", { name: "E-Mail ändern" }).click();
    const dlg = page.getByRole("dialog", { name: "E-Mail-Adresse ändern" });
    await expect(dlg).toContainText(oldEmail);
    // Bereits vergebene Adresse wird abgelehnt
    await dlg.getByLabel("Neue E-Mail-Adresse").fill(USERS.lena.email);
    await dlg.getByLabel(/Begründung/).fill("Ticket #4711, Identität per Video geprüft");
    await dlg.getByRole("button", { name: "Adresse ändern" }).click();
    await expect(dlg).toContainText("bereits von einem anderen Konto verwendet");
    // Neue Adresse, direkt bestätigt
    await dlg.getByLabel("Neue E-Mail-Adresse").fill(newEmail);
    await dlg.getByText(/direkt als bestätigt markieren/).click();
    await dlg.getByRole("button", { name: "Adresse ändern" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator("main")).toContainText(newEmail);

    const row = (await one<{ email: string; verified: boolean; tokens: number; audit: number }>(
      `SELECT u.email, u."emailVerifiedAt" IS NOT NULL verified,
              (SELECT count(*)::int FROM "VerificationToken" t WHERE t."userId" = u.id AND t."usedAt" IS NULL) tokens,
              (SELECT count(*)::int FROM "AuditEvent" a WHERE a."targetId" = u.id AND a.action = 'admin.email_changed') audit
       FROM "User" u WHERE id = $1`,
      [elias],
    ))!;
    expect(row).toEqual({ email: newEmail, verified: true, tokens: 0, audit: row.audit });
    expect(row.audit).toBeGreaterThan(0);

    // Anmeldung: neue Adresse klappt, alte nicht mehr
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/anmelden");
    await p.fill('input[name="email"]', oldEmail);
    await p.fill('input[name="password"]', PASSWORD);
    await p.click('button[type="submit"]');
    await expect(p.locator("main")).toContainText("E-Mail oder Passwort ist nicht korrekt.");
    await p.fill('input[name="email"]', newEmail);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/anmelden")), p.click('button[type="submit"]')]);
  } finally {
    await sql(`UPDATE "User" SET email = $2 WHERE id = $1`, [elias, oldEmail]);
    await restore();
  }
  void confirmDialog;
});

test("E-Mail ändern: nur Administration, nie das eigene Konto", async () => {
  const mattia = await userId("mattia");
  const elias = await userId("elias");
  const { runServer } = await import("./helpers");
  expect(() => runServer(`import("./src/server/admin/users").then((m) => m.changeUserEmail({ id: "${mattia}", role: "PLATFORM_MODERATOR" } as never, "${elias}", { email: "x-${Date.now()}@demo.werkraum.local", reason: "Test ohne Berechtigung" }))`)).toThrow(/nur die Administration/);
  const admin = (await one<{ id: string }>(`SELECT id FROM "User" WHERE role = 'SUPERADMIN' LIMIT 1`))!.id;
  expect(() => runServer(`import("./src/server/admin/users").then((m) => m.changeUserEmail({ id: "${admin}", role: "SUPERADMIN" } as never, "${admin}", { email: "y-${Date.now()}@demo.werkraum.local", reason: "Eigenes Konto ändern" }))`)).toThrow(/eigene Adresse/);
});
