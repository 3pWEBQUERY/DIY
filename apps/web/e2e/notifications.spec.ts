import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

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

test("Wochenrückblick: Einstellung speichern und per Link abbestellen", async ({ browser }) => {
  const me = await userId("elias");
  await sql(`INSERT INTO "UserPreference" ("userId", "updatedAt") VALUES ($1, now()) ON CONFLICT ("userId") DO UPDATE SET "weeklyDigest" = true, "emailDigest" = 'DAILY'`, [me]);
  const page = await loginAs(browser, "elias");
  await page.goto("/einstellungen/benachrichtigungen");
  const box = page.getByRole("checkbox", { name: "Wochenrückblick per E-Mail erhalten" });
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect.poll(async () => (await one<{ w: boolean }>(`SELECT "weeklyDigest" AS w FROM "UserPreference" WHERE "userId" = $1`, [me]))!.w).toBe(false);

  // Abbestell-Link aus der Mail (eigene Liste, eigenes Token)
  await sql(`UPDATE "UserPreference" SET "weeklyDigest" = true WHERE "userId" = $1`, [me]);
  const url = runServer(`import("./src/server/mail-unsubscribe").then((m) => console.log(m.unsubscribeUrl("${me}", "weekly")))`).trim().split("\n").pop()!;
  const u = new URL(url);
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`${u.pathname}${u.search}`);
  await expect(guest.getByRole("heading", { name: "Wochenrückblick abbestellen" })).toBeVisible();
  await guest.getByRole("button", { name: "Wochenrückblick abbestellen" }).click();
  await expect(guest.getByText("Erledigt – du bekommst keinen Wochenrückblick mehr.")).toBeVisible();
  const pref = await one<{ w: boolean; d: string }>(`SELECT "weeklyDigest" AS w, "emailDigest" AS d FROM "UserPreference" WHERE "userId" = $1`, [me]);
  expect(pref).toEqual({ w: false, d: "DAILY" }); // Benachrichtigungs-Mails bleiben
  // Das Token der einen Liste gilt nicht für die andere
  await guest.goto(`/abbestellen?t=${encodeURIComponent(u.searchParams.get("t")!)}`);
  await expect(guest.getByRole("heading", { name: "Link ungültig" })).toBeVisible();
  await guest.context().close();
});
