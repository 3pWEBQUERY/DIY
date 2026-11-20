import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/** Benachrichtigungen löschen: einzeln (Knopf am Eintrag) und gesammelt („Gelesene“ / „Alle löschen“). */

async function seed(recipient: string, n: number, read: boolean) {
  const actor = await userId("lena");
  for (let i = 0; i < n; i++) {
    await sql(
      `INSERT INTO "Notification" (id, "recipientId", "actorId", type, "targetType", "targetId", data, "readAt", "emailedAt", "pushedAt", "updatedAt")
       VALUES ('e2edel' || md5(random()::text), $1, $2, 'FOLLOW', 'USER', $2, '{}', ${read ? "now()" : "NULL"}, now(), now(), now())`,
      [recipient, actor],
    );
  }
}

test("Benachrichtigungen einzeln und gesammelt löschen", async ({ browser }) => {
  const me = await userId("elias");
  await sql(`DELETE FROM "Notification" WHERE "recipientId" = $1`, [me]);
  await seed(me, 1, false);
  await seed(me, 2, true);
  const page = await loginAs(browser, "elias");
  await page.goto("/benachrichtigungen");
  const rows = page.locator("main li").filter({ has: page.getByRole("button", { name: /^Benachrichtigung löschen/ }) });
  await expect(rows).toHaveCount(3);

  // Einzeln
  await rows.first().hover();
  await rows.first().getByRole("button", { name: /^Benachrichtigung löschen/ }).click();
  await expect(rows).toHaveCount(2);
  await expect.poll(async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Notification" WHERE "recipientId" = $1`, [me]))!.n).toBe(2);

  // Gelesene löschen
  await seed(me, 1, false);
  await page.reload();
  await page.getByRole("button", { name: "Benachrichtigungen löschen" }).click();
  await page.getByRole("menuitem", { name: "Gelesene löschen" }).click();
  await expect.poll(async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Notification" WHERE "recipientId" = $1 AND "readAt" IS NOT NULL`, [me]))!.n).toBe(0);
  const unread = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Notification" WHERE "recipientId" = $1`, [me]))!.n;
  expect(unread).toBeGreaterThan(0);
  await expect(rows).toHaveCount(unread);

  // Alle löschen (mit Bestätigung)
  await page.getByRole("button", { name: "Benachrichtigungen löschen" }).click();
  await page.getByRole("menuitem", { name: "Alle löschen" }).click();
  await page.locator('dialog[aria-labelledby="confirm-title"]').getByRole("button", { name: "Alle löschen" }).click();
  await expect(page.getByText("Alles ruhig")).toBeVisible();
  await expect.poll(async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Notification" WHERE "recipientId" = $1`, [me]))!.n).toBe(0);
});
