import { expect, test } from "@playwright/test";
import { loginAs, one, sql } from "./helpers";

/**
 * Hashtags: beim Schreiben vorgeschlagen, nach dem Veröffentlichen gespeichert und klickbar.
 * Ein Klick öffnet die Hashtag-Ansicht über der aktuellen Seite; Esc führt zurück.
 * Direkt aufgerufen ist sie eine eigene Seite.
 */
test("Hashtag schreiben, anklicken und über der Seite ansehen", async ({ browser }) => {
  const tag = `Werkbank${Date.now().toString(36)}`;
  const name = tag.toLowerCase();
  // Bestehender Hashtag für den Vorschlag
  await sql(`INSERT INTO "Hashtag" (id, name, display) VALUES ($1, 'werkstattfund', 'Werkstattfund') ON CONFLICT (name) DO NOTHING`, [`e2e${Date.now()}`]);
  const existing = await one<{ id: string }>(`SELECT id FROM "Hashtag" WHERE name = 'werkstattfund'`);
  const anyPost = await one<{ id: string }>(`SELECT id FROM "Post" WHERE state = 'PUBLISHED' AND visibility = 'PUBLIC' LIMIT 1`);
  await sql(`INSERT INTO "HashtagUse" ("hashtagId", "targetType", "targetId") VALUES ($1, 'POST', $2) ON CONFLICT DO NOTHING`, [existing!.id, anyPost!.id]);

  const elias = await loginAs(browser, "elias");
  await elias.goto("/feed");
  const box = elias.locator("#composer-body");
  await box.click();
  // Vorschlag beim Tippen übernehmen
  await box.pressSequentially("Heute in der Werkstatt #werkstattf");
  const option = elias.getByRole("option", { name: /Werkstattfund/ });
  await expect(option).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("Heute in der Werkstatt #Werkstattfund ");
  await box.pressSequentially(`und #${tag} gebaut`);
  await elias.getByRole("button", { name: "Veröffentlichen", exact: true }).click();

  // Gespeichert, auch mit der Schreibweise
  await expect.poll(async () => (await one<{ display: string }>(`SELECT display FROM "Hashtag" WHERE name = $1`, [name]))?.display).toBe(tag);
  const uses = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "HashtagUse" u JOIN "Hashtag" h ON h.id = u."hashtagId" WHERE h.name = $1 AND u."targetType" = 'POST'`, [name]);
  expect(uses!.n).toBe(1);

  // Klick öffnet das Fenster über dem Feed
  await elias.goto("/feed?tab=neu");
  const link = elias.getByRole("link", { name: `#${tag}` }).first();
  await link.click();
  const dialog = elias.getByRole("dialog", { name: `#${tag}` });
  await expect(dialog).toBeVisible();
  await expect(elias).toHaveURL(new RegExp(`/hashtag/${name}$`));
  await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(`#${tag}`);
  await expect(dialog.getByText(`Heute in der Werkstatt`)).toBeVisible();
  // Reiter ersetzen den Verlaufseintrag, Esc schliesst und führt zum Feed zurück
  await dialog.getByRole("link", { name: /Beiträge/ }).click();
  await expect(elias).toHaveURL(new RegExp(`/hashtag/${name}\\?typ=beitraege$`));
  await elias.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(elias).toHaveURL(/\/feed\?tab=neu$/);

  // Direkt aufgerufen: eigene Seite, auch ohne Anmeldung
  const guest = await browser.newPage();
  await guest.goto(`/hashtag/${encodeURIComponent(tag)}`);
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText(`#${tag}`);
  await expect(guest.getByRole("dialog")).toHaveCount(0);
  await expect(guest.getByText("Heute in der Werkstatt")).toBeVisible();
  await guest.goto("/hashtag/ungenutzt-xyz".replace("-", ""));
  await expect(guest.getByText("Noch keine Inhalte mit #ungenutztxyz")).toBeVisible();
  await guest.close();
});
