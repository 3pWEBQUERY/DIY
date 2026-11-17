import { expect, test, type Page } from "@playwright/test";
import { confirmDialog, loginAs, one, sql, userId } from "./helpers";

/**
 * Stories: erstellen, im Story-Kreis sehen, ansehen (gesehen/Herz/Antwort), Sichtbarkeit,
 * Ausblenden, Highlights über den Ablauf hinaus und Moderation.
 */

async function cleanStories(...who: ("lena" | "mattia" | "mira" | "elias")[]) {
  const ids = await Promise.all(who.map((w) => userId(w)));
  await sql(`DELETE FROM "StoryHighlight" WHERE "ownerId" = ANY($1)`, [ids]);
  await sql(`DELETE FROM "Story" WHERE "authorId" = ANY($1)`, [ids]);
  await sql(`DELETE FROM "StoryMute" WHERE "muterId" = ANY($1) OR "mutedId" = ANY($1)`, [ids]);
}

/** Folgen setzen bzw. entfernen – mit passenden Zählern im Profil (wie der Dienst). */
async function setFollow(followerId: string, followeeId: string, on: boolean) {
  const changed = on
    ? await sql(`INSERT INTO "Follow" ("followerId", "followeeId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`, [followerId, followeeId])
    : await sql(`DELETE FROM "Follow" WHERE "followerId" = $1 AND "followeeId" = $2 RETURNING 1`, [followerId, followeeId]);
  if (!changed.length) return;
  const d = on ? 1 : -1;
  await sql(`UPDATE "UserProfile" SET "followingCount" = "followingCount" + $2 WHERE "userId" = $1`, [followerId, d]);
  await sql(`UPDATE "UserProfile" SET "followerCount" = "followerCount" + $2 WHERE "userId" = $1`, [followeeId, d]);
}

/** Text-Story über den Erstellen-Dialog teilen. */
async function postTextStory(page: Page, text: string, opts: { background?: string; followersOnly?: boolean } = {}) {
  await page.goto("/stories?neu=1");
  const dlg = page.getByRole("dialog", { name: "Neue Story" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("radio", { name: "Text" }).click();
  await dlg.getByRole("textbox", { name: /Text/ }).fill(text);
  await dlg.getByRole("button", { name: opts.background ?? "Salbei" }).click();
  if (opts.followersOnly) {
    await dlg.getByRole("combobox", { name: "Wer sieht die Story?" }).click();
    await page.getByRole("option", { name: "Nur Follower" }).click();
  }
  await dlg.getByRole("button", { name: "Story teilen" }).click();
  await expect(dlg).toBeHidden();
}

test.describe.serial("Stories", () => {
  test.beforeAll(async () => {
    await cleanStories("lena", "mattia", "mira", "elias");
    // Voraussetzungen herstellen (frühere Tests blockieren/entfolgen u. U.): Mattia und Elias folgen Lena,
    // Mira folgt Mattia, Lena folgt Mattia nicht; keine Blockierungen oder Stummschaltungen untereinander
    const [lena, mattia, mira, elias] = await Promise.all([userId("lena"), userId("mattia"), userId("mira"), userId("elias")]);
    const all = [lena, mattia, mira, elias];
    await sql(`DELETE FROM "UserBlock" WHERE "blockerId" = ANY($1) AND "blockedId" = ANY($1)`, [all]);
    await sql(`DELETE FROM "UserMute" WHERE "muterId" = ANY($1) AND "mutedId" = ANY($1)`, [all]);
    await setFollow(mattia, lena, true);
    await setFollow(elias, lena, true);
    await setFollow(mira, mattia, true);
    await setFollow(lena, mattia, false);
  });

  test("erstellen → Story-Kreis der Follower → ansehen, Herz, Antwort als Nachricht", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await postTextStory(lena, "Granny Nummer 25 – noch 11 bis zur Decke.");
    await lena.goto("/feed");
    await expect(lena.getByRole("link", { name: /Deine Story ansehen/ })).toBeVisible();

    const mattia = await loginAs(browser, "mattia");
    await mattia.goto("/feed");
    const ring = mattia.getByRole("link", { name: /Story von Lena Brunner, 1 neu/ });
    await expect(ring).toBeVisible();
    await ring.click();
    await expect(mattia).toHaveURL(/\/stories\/lena\.haekelt/);
    await expect(mattia.getByText("Granny Nummer 25 – noch 11 bis zur Decke.")).toBeVisible();

    await mattia.getByRole("button", { name: "Story mit Herz markieren" }).click();
    await expect(mattia.getByRole("button", { name: "Herz entfernen" })).toBeVisible();
    await mattia.getByRole("textbox", { name: /Antwort an Lena/ }).fill("Durchhalten – sieht toll aus!");
    await mattia.getByRole("button", { name: "Antwort senden" }).click();
    await expect(mattia.getByText("Antwort gesendet.")).toBeVisible();

    const story = (await one<{ id: string; viewCount: number; likeCount: number }>(`SELECT id, "viewCount", "likeCount" FROM "Story" WHERE "authorId" = $1`, [await userId("lena")]))!;
    expect(story.viewCount).toBe(1);
    expect(story.likeCount).toBe(1);
    const msg = await one<{ body: string }>(`SELECT body FROM "Message" WHERE "storyId" = $1`, [story.id]);
    expect(msg?.body).toBe("Durchhalten – sieht toll aus!");

    // Zurück im Feed: Ring als gesehen
    await mattia.getByRole("button", { name: "Stories schliessen" }).first().click();
    await expect(mattia.getByRole("link", { name: /Story von Lena Brunner, gesehen/ })).toBeVisible();

    // Lena: „Gesehen von“ mit Herz, Antwort mit Story-Vorschau im Gespräch
    await lena.goto("/stories/lena.haekelt");
    await lena.getByRole("button", { name: /gesehen/ }).click();
    const viewers = lena.getByRole("dialog", { name: "Gesehen von" });
    await expect(viewers.getByText("Mattia Rossi")).toBeVisible();
    await expect(viewers.getByLabel("hat ein Herz gegeben")).toBeVisible();
    await viewers.getByRole("button", { name: "Schliessen" }).click();

    await lena.goto("/nachrichten");
    await lena.getByText("Mattia Rossi").first().click();
    await expect(lena.getByText("Antwort auf deine Story")).toBeVisible();
    await expect(lena.getByRole("link", { name: "Story ansehen" })).toBeVisible();
  });

  test("„Nur Follower“: Follower sehen die Story, andere und Gäste nicht", async ({ browser }) => {
    const mattia = await loginAs(browser, "mattia");
    await postTextStory(mattia, "Nur für Follower: neue Hobelbank.", { followersOnly: true, background: "Tinte" });

    // Mira folgt Mattia → sieht die Story
    const mira = await loginAs(browser, "mira");
    await mira.goto("/stories/mattia.holz");
    await expect(mira.getByText("Nur für Follower: neue Hobelbank.")).toBeVisible();

    // Lena folgt Mattia nicht → keine Story
    const lena = await loginAs(browser, "lena");
    await lena.goto("/stories/mattia.holz");
    await expect(lena.getByRole("heading", { name: "Gerade keine Stories." })).toBeVisible();

    // Gäste sehen keine Follower-Stories
    const guest = await (await browser.newContext()).newPage();
    await guest.goto("/stories/mattia.holz");
    await expect(guest.getByRole("heading", { name: "Gerade keine Stories." })).toBeVisible();
  });

  test("Stories ausblenden entfernt die Person aus dem Story-Kreis", async ({ browser }) => {
    const elias = await loginAs(browser, "elias");
    await elias.goto("/feed");
    await expect(elias.getByRole("link", { name: /Story von Lena Brunner/ })).toBeVisible();
    await elias.goto("/stories/lena.haekelt");
    await elias.getByRole("button", { name: "Story-Optionen" }).click();
    await elias.getByRole("menuitem", { name: /Stories von Lena ausblenden/ }).click();
    await elias.goto("/feed");
    await expect(elias.getByRole("link", { name: /Story von Lena Brunner/ })).toHaveCount(0);
    // Rückgängig über die Feed-Einstellungen
    await elias.goto("/einstellungen/feed");
    await elias.getByRole("button", { name: "Stories von Lena Brunner wieder anzeigen" }).click();
    await elias.goto("/feed");
    await expect(elias.getByRole("link", { name: /Story von Lena Brunner/ })).toBeVisible();
  });

  test("Highlight bleibt nach Ablauf auf dem Profil; Löschen entfernt die Story überall", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    const storyId = (await one<{ id: string }>(`SELECT id FROM "Story" WHERE "authorId" = $1`, [await userId("lena")]))!.id;
    await lena.goto(`/stories/lena.haekelt?story=${storyId}`);
    await lena.getByRole("button", { name: "Highlight" }).click();
    const picker = lena.getByRole("dialog", { name: "Zu Highlight hinzufügen" });
    await picker.getByRole("textbox", { name: "Neues Highlight" }).fill("Granny-Decke");
    await picker.getByRole("button", { name: "Anlegen" }).click();
    await expect(picker).toBeHidden();

    // 25 Stunden später: aus dem Story-Kreis verschwunden, im Highlight weiterhin sichtbar
    await sql(`UPDATE "Story" SET "expiresAt" = now() - interval '1 hour', "createdAt" = now() - interval '25 hours' WHERE id = $1`, [storyId]);
    const mattia = await loginAs(browser, "mattia");
    await mattia.goto("/feed");
    await expect(mattia.getByRole("link", { name: /Story von Lena Brunner/ })).toHaveCount(0);
    await mattia.goto("/u/lena.haekelt");
    await mattia.getByRole("link", { name: /Highlight Granny-Decke/ }).click();
    await expect(mattia).toHaveURL(/\/highlights\//);
    await expect(mattia.getByText("Granny Nummer 25 – noch 11 bis zur Decke.")).toBeVisible();

    // Lena löscht die Story → Highlight ist leer und verschwindet
    await lena.goto(`/stories/lena.haekelt?story=${storyId}`);
    await lena.getByRole("button", { name: "Story-Optionen" }).click();
    await lena.getByRole("menuitem", { name: "Story löschen" }).click();
    await confirmDialog(lena).getByRole("button", { name: "Löschen" }).click();
    await expect(lena.getByText("Story gelöscht.")).toBeVisible();
    expect(await one(`SELECT 1 FROM "StoryHighlight" WHERE "ownerId" = $1`, [await userId("lena")])).toBeFalsy();
  });

  test("Melden → Moderation blendet die Story aus", async ({ browser }) => {
    const mattiaId = await userId("mattia");
    const storyId = (await one<{ id: string }>(`SELECT id FROM "Story" WHERE "authorId" = $1 AND state = 'PUBLISHED'`, [mattiaId]))!.id;
    const mira = await loginAs(browser, "mira");
    await mira.goto("/stories/mattia.holz");
    await mira.getByRole("button", { name: "Story-Optionen" }).click();
    await mira.getByRole("menuitem", { name: "Story melden" }).click();
    const report = mira.getByRole("dialog", { name: "Inhalt melden" });
    await report.getByText("Spam oder Werbung").click();
    await report.getByRole("button", { name: "Meldung absenden" }).click();
    await expect(report.getByText(/Fallnummer/)).toBeVisible();
    const c = await one<{ id: string }>(`SELECT id FROM "ModerationCase" WHERE "targetType" = 'STORY' AND "targetId" = $1`, [storyId]);
    expect(c).toBeTruthy();

    // Entscheidung wie in der Moderation (Ausblenden) → für niemanden mehr sichtbar
    await sql(`UPDATE "Story" SET state = 'HIDDEN' WHERE id = $1`, [storyId]);
    await mira.goto("/stories/mattia.holz");
    await expect(mira.getByRole("heading", { name: "Gerade keine Stories." })).toBeVisible();
  });
});
