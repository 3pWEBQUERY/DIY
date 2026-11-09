import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql } from "./helpers";

test.describe.serial("Wettbewerb mit Einreichungen und Abstimmung", () => {
  let id = "";
  const url = () => `/c/werkbank-holz/wettbewerbe/${id}`;

  test("Moderation legt an, Mitglieder reichen ein", async ({ browser }) => {
    const mattia = await loginAs(browser, "mattia");
    await mattia.goto("/c/werkbank-holz/verwalten?bereich=challenges");
    await mattia.getByLabel("Titel").fill("E2E Restholz");
    await mattia.getByLabel("Beschreibung").fill("Baue etwas Schönes aus Resten.");
    await mattia.getByLabel("Preis").fill("Gutschein CHF 50");
    await mattia.getByLabel("Einreichung bis").fill(new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10));
    await mattia.getByRole("button", { name: "Wettbewerb anlegen" }).click();
    await expect.poll(async () => (await one<{ id: string }>(`SELECT id FROM "CommunityChallenge" WHERE title = 'E2E Restholz'`))?.id ?? "").not.toBe("");
    id = (await one<{ id: string; judging: string }>(`SELECT id, judging FROM "CommunityChallenge" WHERE title = 'E2E Restholz'`))!.id;

    for (const who of ["lena", "mira"] as const) {
      const p = await loginAs(browser, who);
      await p.goto(url());
      await p.getByRole("button", { name: "Projekt einreichen" }).click();
      const d = p.getByRole("dialog", { name: "Projekt einreichen" });
      await d.getByRole("radio").first().click();
      await d.getByRole("textbox").fill(`Gebaut von ${who}`);
      await d.getByRole("button", { name: "Einreichen" }).click();
      await expect(p.locator("main")).toContainText("Du bist dabei");
    }
  });

  test("Abstimmung: 3 Stimmen, nicht für sich selbst, Zwischenstand verborgen", async ({ browser }) => {
    await sql(`UPDATE "CommunityChallenge" SET "startsAt" = now() - interval '10 days', "endsAt" = now() - interval '1 hour', "votingEndsAt" = now() + interval '3 days' WHERE id = $1`, [id]);
    const mattia = await loginAs(browser, "mattia");
    await mattia.goto(url());
    await expect(mattia.locator("main")).toContainText(/Abstimmung läuft/i);
    await expect(mattia.getByRole("button", { name: "Stimme geben" })).toHaveCount(2);
    await mattia.getByRole("button", { name: "Stimme geben" }).first().click();
    await expect(mattia.getByRole("button", { name: "Deine Stimme" })).toHaveCount(1);
    const mira = await loginAs(browser, "mira");
    await mira.goto(url());
    await expect(mira.getByRole("button", { name: "Stimme geben" })).toHaveCount(1);
    await mira.getByRole("button", { name: "Stimme geben" }).click();
    await expect(mira.getByRole("button", { name: "Deine Stimme" })).toHaveCount(1);
    const anon = await browser.newPage();
    await anon.goto(url());
    await expect(anon.locator("main")).not.toContainText(/\b\d+ Stimmen?\b(?! vergeben)/);
  });

  test("Ergebnis: Auswertung, Gewinner:innen, Benachrichtigung, Übersicht", async ({ browser }) => {
    await sql(`UPDATE "CommunityChallenge" SET "votingEndsAt" = now() - interval '1 minute' WHERE id = $1`, [id]);
    runServer(`import("./src/server/communities/competitions").then(m=>m.runCompetitionPhases())`);
    const anon = await browser.newPage();
    await anon.goto(url());
    await expect(anon.locator("main")).toContainText("Gewinner:innen");
    await expect(anon.locator("main")).toContainText("1. Platz");
    const lena = await loginAs(browser, "lena");
    await lena.goto("/benachrichtigungen");
    await expect(lena.locator("main")).toContainText("E2E Restholz");
    await anon.goto("/wettbewerbe");
    await expect(anon.locator("main")).toContainText("E2E Restholz");
  });
});

test("Auszeichnung erscheint im Profil der Gewinnerin bzw. des Gewinners", async ({ page }) => {
  const winner = await one<{ handle: string; title: string }>(
    `SELECT p.handle, c.title FROM "ChallengeEntry" e JOIN "CommunityChallenge" c ON c.id = e."challengeId" JOIN "UserProfile" p ON p."userId" = e."userId"
     WHERE c.title = 'E2E Restholz' AND e.place = 1`,
  );
  expect(winner).toBeTruthy();
  await page.goto(`/u/${winner!.handle}`);
  await expect(page.getByText("Auszeichnungen")).toBeVisible();
  await expect(page.locator("main")).toContainText("1. Platz · E2E Restholz");
});

test("Neuer Wettbewerb: Mitglieder werden beim Start benachrichtigt", async () => {
  const c = await one<{ id: string }>(`SELECT id FROM "Community" WHERE slug = 'werkbank-holz'`);
  const creator = await one<{ userId: string }>(`SELECT "userId" FROM "UserProfile" WHERE handle = 'mattia.holz'`);
  await sql(
    `INSERT INTO "CommunityChallenge" (id, "communityId", title, "startsAt", "endsAt", "votingEndsAt", "createdById") VALUES ('e2e_start', $1, 'E2E Startmeldung', now() - interval '1 minute', now() + interval '5 days', now() + interval '12 days', $2)`,
    [c!.id, creator!.userId],
  );
  runServer(`import("./src/server/communities/competitions").then(m=>m.runCompetitionPhases())`);
  const n = await one<{ n: string }>(`SELECT count(*)::text AS n FROM "Notification" WHERE data->>'kind' = 'COMPETITION' AND data->>'message' LIKE '%E2E Startmeldung%'`);
  expect(Number(n!.n)).toBeGreaterThanOrEqual(2);
  const self = await one<{ n: string }>(`SELECT count(*)::text AS n FROM "Notification" WHERE "recipientId" = $1 AND data->>'message' LIKE '%E2E Startmeldung%'`, [creator!.userId]);
  expect(self!.n).toBe("0");
});
