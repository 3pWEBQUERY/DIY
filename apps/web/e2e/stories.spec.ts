import path from "node:path";
import { fileURLToPath } from "node:url";
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

/** Neue Story im Editor öffnen (Text- oder Foto-Story) */
async function openComposer(page: Page) {
  await page.goto("/stories?neu=1");
  const dlg = page.getByRole("dialog", { name: "Neue Story" });
  await expect(dlg).toBeVisible();
  return dlg;
}

/** Erwähnung über den Sticker-Dialog setzen */
async function addMention(dlg: ReturnType<Page["getByRole"]>, handle: string) {
  await dlg.getByRole("button", { name: "Sticker", exact: true }).click();
  await dlg.getByRole("textbox", { name: "Person erwähnen" }).fill(handle.slice(0, 4));
  await dlg.getByRole("button", { name: new RegExp(`@${handle.replace(".", "\\.")}`) }).click();
}

test.describe.serial("Story-Editor", () => {
  test.beforeAll(async () => {
    await cleanStories("lena", "mattia", "mira");
    const [lena, mattia, mira] = await Promise.all([userId("lena"), userId("mattia"), userId("mira")]);
    const all = [lena, mattia, mira];
    await sql(`DELETE FROM "UserBlock" WHERE "blockerId" = ANY($1) AND "blockedId" = ANY($1)`, [all]);
    await sql(`DELETE FROM "UserMute" WHERE "muterId" = ANY($1) AND "mutedId" = ANY($1)`, [all]);
    // Mattia folgt Lena, Mira folgt Lena nicht
    await setFollow(mattia, lena, true);
    await setFollow(mira, lena, false);
    await sql(`DELETE FROM "Notification" WHERE "recipientId" = $1 AND type = 'MENTION' AND "targetType" = 'STORY'`, [mira]);
  });

  test("Text-Story gestalten: Textebene per Tastatur, Erwähnung → Follower sieht sie, Erwähnte wird benachrichtigt, Link führt zum Profil", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    const dlg = await openComposer(lena);
    await dlg.getByRole("radio", { name: "Text" }).click();
    await dlg.getByRole("textbox", { name: /^Text/ }).fill("Werkbank-Update");
    await dlg.getByRole("button", { name: "Text hinzufügen" }).click();
    await lena.keyboard.type("Frisch gewickelt");
    await dlg.getByRole("button", { name: "Fläche" }).click();
    await dlg.getByRole("button", { name: "Fertig" }).click();
    // Tastaturbedienung (WCAG 2.5.7): Element wählen, verschieben, drehen
    const el = dlg.getByRole("button", { name: /Text „Frisch gewickelt“/ });
    await el.focus();
    for (let i = 0; i < 5; i++) await lena.keyboard.press("ArrowRight");
    await lena.keyboard.press("]");
    await addMention(dlg, "mira.strickt");
    await expect(dlg.getByRole("button", { name: /Erwähnung @mira\.strickt/ })).toBeVisible();
    await dlg.getByRole("button", { name: "Story teilen" }).click();
    await expect(dlg).toBeHidden();

    const story = (await one<{ id: string; layout: { elements: { type: string; x: number; rotation: number; userId?: string; text?: string }[] } }>(`SELECT id, layout FROM "Story" WHERE "authorId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [await userId("lena")]))!;
    const text = story.layout.elements.find((e) => e.type === "text")!;
    expect(text.text).toBe("Frisch gewickelt");
    expect(text.x).toBeGreaterThan(0.5);
    expect(text.rotation).toBe(5);
    expect(story.layout.elements.find((e) => e.type === "mention")?.userId).toBe(await userId("mira"));

    // Erwähnte Person: Benachrichtigung mit Link auf die Story
    const n = await one<{ data: { href: string } }>(`SELECT data FROM "Notification" WHERE "recipientId" = $1 AND type = 'MENTION' AND "targetType" = 'STORY' AND "targetId" = $2`, [await userId("mira"), story.id]);
    expect(n?.data.href).toBe(`/stories/lena.haekelt?story=${story.id}`);

    // Follower sieht die Story im Story-Kreis samt Ebenen; die Erwähnung führt zum Profil (blättert nicht weiter)
    const mattia = await loginAs(browser, "mattia");
    await mattia.goto("/feed");
    await mattia.getByRole("link", { name: /Story von Lena Brunner, 1 neu/ }).click();
    await expect(mattia.getByText("Frisch gewickelt")).toBeVisible();
    await expect(mattia.getByText("Werkbank-Update")).toBeVisible();
    const mention = mattia.getByRole("link", { name: "Profil von @mira.strickt" });
    await expect(mention).toBeVisible();
    await mention.click();
    await expect(mattia).toHaveURL(/\/u\/mira\.strickt$/);
  });

  test("„Nur Follower“: Erwähnte ohne Zugriff werden nicht benachrichtigt", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    const dlg = await openComposer(lena);
    await dlg.getByRole("radio", { name: "Text" }).click();
    await dlg.getByRole("textbox", { name: /^Text/ }).fill("Nur für meine Follower");
    await addMention(dlg, "mira.strickt");
    await dlg.getByRole("combobox", { name: "Wer sieht die Story?" }).click();
    await lena.getByRole("option", { name: "Nur Follower" }).click();
    await dlg.getByRole("button", { name: "Story teilen" }).click();
    await expect(dlg).toBeHidden();
    const story = (await one<{ id: string }>(`SELECT id FROM "Story" WHERE "authorId" = $1 AND visibility = 'FOLLOWERS' ORDER BY "createdAt" DESC LIMIT 1`, [await userId("lena")]))!;
    expect(await one(`SELECT 1 FROM "Notification" WHERE "recipientId" = $1 AND "targetType" = 'STORY' AND "targetId" = $2`, [await userId("mira"), story.id])).toBeFalsy();
  });

  test("Story ohne Gestaltung (Altbestand) erscheint unverändert", async ({ browser }) => {
    const mattiaId = await userId("mattia");
    await sql(
      `INSERT INTO "Story" (id, "authorId", kind, text, background, visibility, "expiresAt") VALUES ('e2e-alt-story', $1, 'TEXT', 'Alte Story ohne Ebenen', 'sage', 'PUBLIC', now() + interval '2 hours') ON CONFLICT (id) DO UPDATE SET "expiresAt" = excluded."expiresAt", layout = NULL`,
      [mattiaId],
    );
    const lena = await loginAs(browser, "lena");
    await lena.goto("/stories/mattia.holz?story=e2e-alt-story");
    await expect(lena.getByText("Alte Story ohne Ebenen")).toBeVisible();
    await expect(lena.getByRole("link", { name: /^Profil von @/ })).toHaveCount(0);
    await sql(`DELETE FROM "Story" WHERE id = 'e2e-alt-story'`);
  });

  test("Foto zuschneiden: nur der 9:16-Ausschnitt wird hochgeladen, Filter wird gespeichert", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    const dlg = await openComposer(lena);
    await lena.locator('input[type="file"]').setInputFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/foto.jpg"));
    await expect(dlg.getByRole("group", { name: "Bildausschnitt" })).toBeVisible();
    await dlg.getByRole("button", { name: "Zuschnitt übernehmen" }).click();
    await expect(dlg.getByRole("button", { name: "Zuschneiden", exact: true })).toBeVisible({ timeout: 30_000 });
    await dlg.getByRole("button", { name: "Filter", exact: true }).click();
    await dlg.getByRole("button", { name: "Sepia" }).click();
    await dlg.getByRole("button", { name: "Fertig" }).click();
    await dlg.getByRole("button", { name: "Story teilen" }).click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });
    const s = (await one<{ layout: { media?: { filter: string } }; width: number | null; height: number | null }>(
      `SELECT s.layout, m.width, m.height FROM "Story" s JOIN "Media" m ON m.id = s."mediaId" WHERE s."authorId" = $1 ORDER BY s."createdAt" DESC LIMIT 1`,
      [await userId("lena")],
    ))!;
    expect(s.layout.media?.filter).toBe("sepia");
    // Fixture 800 × 1000 → grösster 9:16-Ausschnitt ≈ 563 × 1000
    expect(s.width).toBeLessThan(800);
    expect((s.height ?? 0) / (s.width ?? 1)).toBeCloseTo(16 / 9, 1);
  });
});
