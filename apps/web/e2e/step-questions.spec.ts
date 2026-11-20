import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Fragen zu einzelnen Schritten: Leser:in fragt bei Schritt 2, der Zähler steigt, die Frage trägt im
 * allgemeinen Bereich den Hinweis „Schritt 2“, die Autorin wird benachrichtigt und landet direkt beim Schritt.
 */
test("Frage zu einem Schritt stellen und als Autorin direkt beim Schritt sehen", async ({ browser }) => {
  const t = await one<{ id: string; slug: string }>(
    `SELECT t.id, t.slug FROM "Tutorial" t JOIN "User" u ON u.id = t."authorId" WHERE u.email = 'lena-haekelt@demo.werkraum.local' AND t.state = 'PUBLISHED' ORDER BY t."createdAt" LIMIT 1`,
  );
  expect(t, "Seed enthält eine Anleitung von Lena").toBeTruthy();
  await sql(`DELETE FROM "Comment" WHERE "targetId" = $1 AND "stepKey" IS NOT NULL`, [t!.id]);
  const question = `Welche Nadelgrösse bei Schritt zwei, Test ${Date.now()}`;

  const elias = await loginAs(browser, "elias");
  await elias.goto(`/anleitungen/${t!.slug}`);
  const step2 = elias.locator("#schritt-2");
  await step2.getByRole("button", { name: "Frage zu diesem Schritt" }).click();
  const panel = elias.getByRole("region", { name: "Fragen zu Schritt 2" });
  await expect(panel.getByText("Noch keine Fragen zu diesem Schritt.")).toBeVisible();
  await panel.getByRole("textbox", { name: "Frage zu Schritt 2 …" }).fill(question);
  await panel.getByRole("button", { name: "Senden" }).click();
  await expect(panel.getByText(question)).toBeVisible();
  await expect(step2.getByRole("button", { name: "Fragen zu diesem Schritt (1)" })).toBeVisible();

  const c = await one<{ stepKey: string; isQuestion: boolean }>(`SELECT "stepKey", "isQuestion" FROM "Comment" WHERE body = $1`, [question]);
  expect(c!.stepKey).toBeTruthy();
  expect(c!.isQuestion).toBe(true);

  // Allgemeiner Fragenbereich zeigt den Schritt
  await elias.reload();
  const general = elias.locator("li").filter({ hasText: question }).first();
  await expect(general.getByRole("link", { name: "Schritt 2" })).toBeVisible();

  // Benachrichtigung der Autorin führt direkt zum Schritt, die Fragen sind offen
  const n = await one<{ href: string }>(`SELECT data->>'href' AS href FROM "Notification" WHERE "recipientId" = $1 AND type = 'COMMENT' AND data->>'excerpt' = $2`, [await userId("lena"), question]);
  expect(n!.href).toMatch(/#schritt-2$/);
  const lena = await loginAs(browser, "lena");
  await lena.goto(n!.href);
  await expect(lena.getByRole("region", { name: "Fragen zu Schritt 2" }).getByText(question)).toBeVisible();
});
