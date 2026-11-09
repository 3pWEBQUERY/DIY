import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

/** Paket D: Privatsphäre privater Communities, Apple-Kontoübernahme, Uploads, Moderation, Gruppenchats, Events. */

const asUser = (id: string) => `(await (await import("./src/server/db")).db.user.findUniqueOrThrow({ where: { id: "${id}" }, include: { profile: true } })) as never`;

test("Private Community: kein Repost, nicht über Sammlungen, keine Events in der App", async ({ request }) => {
  const lena = await userId("lena");
  const c = (await one<{ id: string; visibility: string }>(`SELECT id, visibility FROM "Community" WHERE slug = 'haekelkreis-zuerich'`))!;
  const post = await one<{ id: string; authorId: string }>(`SELECT id, "authorId" FROM "Post" WHERE "communityId" = $1 AND state = 'PUBLISHED' LIMIT 1`, [c.id]);
  test.skip(!post, "Kein Community-Beitrag");
  // Reste eines abgebrochenen Laufs entfernen
  await sql(`DELETE FROM "CommunityEvent" WHERE id = 'e2e_priv_event'`);
  await sql(`DELETE FROM "Post" WHERE id = 'e2e_old_repost'`);
  await sql(`DELETE FROM "Bookmark" WHERE "collectionId" = 'e2e_pub_col'`);
  await sql(`DELETE FROM "Collection" WHERE id = 'e2e_pub_col'`);
  await sql(`UPDATE "Community" SET visibility = 'PRIVATE' WHERE id = $1`, [c.id]);
  await sql(`INSERT INTO "CommunityEvent" (id, "communityId", "organizerId", title, "startsAt", "endsAt", "updatedAt") VALUES ('e2e_priv_event', $1, $2, 'E2E Geheimes Treffen', now() + interval '3 days', now() + interval '3 days 2 hours', now())`, [c.id, post!.authorId]);
  try {
    // Repost eines Community-Beitrags wird abgelehnt
    expect(() => runServer(`import("./src/server/social/posts").then(async (m) => m.createPost(${asUser(lena)}, { body: "E2E Repost", repostOfId: "${post!.id}" }))`)).toThrow(/kann nicht geteilt werden/);
    // Bestehender Repost zeigt das Original nicht
    await sql(`INSERT INTO "Post" (id, "authorId", body, "repostOfId", state, visibility, "publishedAt", "createdAt", "updatedAt") VALUES ('e2e_old_repost', $1, '', $2, 'PUBLISHED', 'PUBLIC', now(), now(), now())`, [lena, post!.id]);
    const out = runServer(`import("./src/server/social/posts").then(async (m) => { const [v] = await m.hydratePosts(["e2e_old_repost"], null); process.stdout.write("REPOST=" + JSON.stringify(v?.repostOf ?? null)); })`);
    expect(out).toContain("REPOST=null");
    // Öffentliche Sammlung mit dem privaten Beitrag: für Gäste leer
    const col = (await one<{ id: string }>(`INSERT INTO "Collection" (id, "ownerId", title, slug, visibility, "createdAt", "updatedAt") VALUES ('e2e_pub_col', $1, 'E2E Öffentlich', 'e2e-oeffentlich', 'PUBLIC', now(), now()) RETURNING id`, [lena]))!;
    await sql(`INSERT INTO "Bookmark" ("userId", "targetType", "targetId", "collectionId", "createdAt") VALUES ($1, 'POST', $2, $3, now()) ON CONFLICT ("userId", "targetType", "targetId") DO UPDATE SET "collectionId" = $3`, [lena, post!.id, col.id]);
    const page = await request.get(`/sammlungen/${col.id}`);
    expect(await page.text()).not.toContain(post!.id);
    // App: Events der privaten Community ohne Mitgliedschaft nicht abrufbar
    const res = await request.get(`/api/v1/app/communities/${c.id}/events`);
    expect(JSON.stringify(await res.json())).not.toContain("E2E Geheimes Treffen");
  } finally {
    await sql(`DELETE FROM "Bookmark" WHERE "collectionId" = 'e2e_pub_col'`);
    await sql(`DELETE FROM "Collection" WHERE id = 'e2e_pub_col'`);
    await sql(`DELETE FROM "Post" WHERE id = 'e2e_old_repost'`);
    await sql(`DELETE FROM "CommunityEvent" WHERE id = 'e2e_priv_event'`);
    await sql(`UPDATE "Community" SET visibility = $2 WHERE id = $1`, [c.id, c.visibility]);
  }
});

test("Apple-Login: unbestätigtes Fremdkonto mit derselben Adresse verliert Passwort und Sitzungen", async () => {
  const email = `e2e-apple-${Date.now()}@demo.werkraum.local`;
  const id = runServer(`import("./src/server/db").then(async ({ db }) => {
    const u = await db.user.create({ data: { email: "${email}", passwordHash: "x", profile: { create: { handle: "e2e.apple.${Date.now() % 100000}", displayName: "Vorab" } } } });
    await db.session.create({ data: { id: "e2e_apple_sess_${Date.now()}", userId: u.id, expiresAt: new Date(Date.now() + 86400000) } });
    process.stdout.write("ID=" + u.id);
  })`).match(/ID=(\S+)/)![1]!;
  runServer(`import("./src/server/identity/apple").then((m) => m.linkAppleClaims({ sub: "e2e-apple-sub-${Date.now()}", email: "${email}", email_verified: true }, null))`);
  const u = (await one<{ pw: string | null; verified: boolean; live: number }>(
    `SELECT "passwordHash" pw, "emailVerifiedAt" IS NOT NULL verified, (SELECT count(*)::int FROM "Session" s WHERE s."userId" = u.id AND s."revokedAt" IS NULL) live FROM "User" u WHERE id = $1`,
    [id],
  ))!;
  expect(u).toEqual({ pw: null, verified: true, live: 0 });
});

test("Upload über den Server: gestreamt, Grösse geprüft; Dateien nur mit Shop", async ({ browser }) => {
  const page = await loginAs(browser, "lena");
  const file = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/foto.jpg"));
  const req = await page.request.post("/api/v1/media", { data: { mime: "image/jpeg", bytes: file.byteLength } });
  const { data } = await req.json();
  const put = await page.request.put(data.fallbackUrl, { data: file, headers: { "content-type": "image/jpeg" } });
  expect(put.status()).toBe(200);
  const done = await page.request.post(`/api/v1/media/${data.mediaId}/complete`);
  expect(done.status()).toBe(200);
  // Grösser als angemeldet → abgelehnt
  const req2 = await (await page.request.post("/api/v1/media", { data: { mime: "image/jpeg", bytes: 1000 } })).json();
  const put2 = await page.request.put(req2.data.fallbackUrl, { data: file, headers: { "content-type": "image/jpeg" } });
  expect(put2.status()).toBeGreaterThanOrEqual(400);
  // PDF ohne Shop
  const elias = await loginAs(browser, "elias");
  const shop = await one(`SELECT 1 FROM "Shop" WHERE "ownerId" = $1`, [await userId("elias")]);
  test.skip(!!shop, "Elias hat einen Shop");
  const pdf = await elias.request.post("/api/v1/media", { data: { mime: "application/pdf", bytes: 2000, purpose: "private" } });
  expect(pdf.status()).toBe(403);
});

test("Einspruch: nimmt nur die eigene Massnahme zurück, ein späterer Bann bleibt", async () => {
  const elias = await userId("elias");
  const admin = (await one<{ id: string }>(`SELECT id FROM "User" WHERE role = 'SUPERADMIN' LIMIT 1`))!.id;
  const mod = await userId("mattia");
  const before = (await one<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [elias]))!.status;
  const caseId = (await one<{ id: string }>(
    `INSERT INTO "ModerationCase" (id, "targetType", "targetId", "subjectUserId", status, "primaryReason", "updatedAt") VALUES ('e2e_case', 'USER', $1, $1, 'OPEN', 'SPAM', now()) RETURNING id`,
    [elias],
  ))!.id;
  try {
    const actor = (id: string, role: string) => `{ id: "${id}", role: "${role}" } as never`;
    runServer(`import("./src/server/moderation/service").then((m) => m.decideCase(${actor(mod, "PLATFORM_MODERATOR")}, "${caseId}", { action: "SUSPEND", reason: "E2E Prüfung der Sperre", publicNote: "E2E Test", days: 3 }))`);
    expect((await one<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [elias]))!.status).toBe("SUSPENDED");
    // Zweiter gleichzeitiger Entscheid desselben Falls schlägt fehl
    expect(() => runServer(`import("./src/server/moderation/service").then((m) => m.decideCase(${actor(admin, "SUPERADMIN")}, "${caseId}", { action: "BAN", reason: "E2E zweite Entscheidung", publicNote: "E2E" }))`)).toThrow(/bereits entschieden/);
    // Inzwischen anderweitig gebannt
    await sql(`UPDATE "User" SET status = 'BANNED' WHERE id = $1`, [elias]);
    runServer(`import("./src/server/moderation/service").then((m) => m.submitAppeal({ id: "${elias}" }, "${caseId}", { statement: "E2E Einspruch: Das war ein Missverständnis, bitte prüfen. Danke!" }))`);
    const appeal = (await one<{ id: string }>(`SELECT id FROM "Appeal" WHERE "caseId" = $1`, [caseId]))!.id;
    runServer(`import("./src/server/moderation/service").then((m) => m.decideAppeal(${actor(admin, "SUPERADMIN")}, "${appeal}", { decision: "OVERTURNED", note: "E2E stattgegeben" }))`);
    expect((await one<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [elias]))!.status).toBe("BANNED");
  } finally {
    await sql(`UPDATE "User" SET status = $2::"AccountStatus", "suspendedUntil" = NULL WHERE id = $1`, [elias, before]);
    await sql(`DELETE FROM "Appeal" WHERE "caseId" = 'e2e_case'`);
    await sql(`DELETE FROM "ModerationAction" WHERE "caseId" = 'e2e_case'`);
    await sql(`DELETE FROM "ModerationCase" WHERE id = 'e2e_case'`);
  }
});

test("Gruppenchat: Neue sehen den Verlauf erst ab ihrem Beitritt", async () => {
  const lena = await userId("lena");
  const mira = await userId("mira");
  const out = runServer(`(async () => {
    const g = await import("./src/server/messaging/groups");
    const ms = await import("./src/server/messaging/service");
    const { db } = await import("./src/server/db");
    const r = await g.createGroup(${asUser(lena)}, { title: "E2E Verlauf", handles: ["mattia.holz", "elias.garten"], body: "E2E geheim vor Mira" });
    const id = (r as { id?: string; conversationId?: string }).id ?? (r as { conversationId: string }).conversationId;
    await new Promise((res) => setTimeout(res, 50));
    await g.addGroupMembers(${asUser(lena)}, id, { handles: ["mira.strickt"] });
    await ms.sendMessage(${asUser(lena)}, id, { body: "E2E nach Mira" });
    const t = await ms.getThread(${asUser(mira)}, id);
    process.stdout.write("IDS=" + id + "|" + JSON.stringify(t.messages.map((m) => m.body)));
    await db.conversation.delete({ where: { id } });
  })()`);
  expect(out).toContain("E2E nach Mira");
  expect(out).not.toContain("E2E geheim vor Mira");
  void mira;
});

test("Events: Austritt entfernt Zusagen für kommende Events", async () => {
  const c = (await one<{ id: string }>(`SELECT id FROM "Community" WHERE slug = 'werkbank-holz'`))!.id;
  const mira = await userId("mira");
  const mattia = await userId("mattia");
  const wasMember = await one<{ role: string; state: string }>(`SELECT role, state FROM "CommunityMember" WHERE "communityId" = $1 AND "userId" = $2`, [c, mira]);
  await sql(`INSERT INTO "CommunityMember" ("communityId", "userId", role, state, "joinedAt") VALUES ($1, $2, 'MEMBER', 'ACTIVE', now()) ON CONFLICT DO NOTHING`, [c, mira]);
  await sql(`INSERT INTO "CommunityEvent" (id, "communityId", "organizerId", title, "startsAt", "endsAt", "goingCount", "updatedAt") VALUES ('e2e_leave_event', $1, $2, 'E2E Austritt', now() + interval '5 days', now() + interval '5 days 2 hours', 1, now())`, [c, mattia]);
  await sql(`INSERT INTO "EventAttendee" ("eventId", "userId", status, "createdAt", "updatedAt") VALUES ('e2e_leave_event', $1, 'GOING', now(), now())`, [mira]);
  try {
    runServer(`import("./src/server/communities/service").then(async (m) => m.leaveCommunity(${asUser(mira)}, "${c}"))`);
    const r = (await one<{ n: number; going: number }>(`SELECT (SELECT count(*)::int FROM "EventAttendee" WHERE "eventId" = 'e2e_leave_event') n, "goingCount" going FROM "CommunityEvent" WHERE id = 'e2e_leave_event'`))!;
    expect(r).toEqual({ n: 0, going: 0 });
  } finally {
    await sql(`DELETE FROM "CommunityEvent" WHERE id = 'e2e_leave_event'`);
    if (wasMember) await sql(`INSERT INTO "CommunityMember" ("communityId", "userId", role, state, "joinedAt") VALUES ($1, $2, $3::"CommunityRoleKind", $4::"MembershipState", now()) ON CONFLICT DO NOTHING`, [c, mira, wasMember.role, wasMember.state]);
  }
});

test("Sperre: läuft von selbst ab, Gesperrte erhalten trotzdem Moderationsmails", async () => {
  const elias = await userId("elias");
  const before = (await one<{ status: string; suspendedUntil: Date | null }>(`SELECT status, "suspendedUntil" FROM "User" WHERE id = $1`, [elias]))!;
  try {
    // Abgelaufene befristete Sperre → Worker setzt das Konto wieder aktiv und informiert
    await sql(`UPDATE "User" SET status = 'SUSPENDED', "suspendedUntil" = now() - interval '1 minute' WHERE id = $1`, [elias]);
    runServer(`import("./src/server/moderation/expiry").then((m) => m.liftExpiredSuspensions())`);
    const u = (await one<{ status: string; suspendedUntil: Date | null }>(`SELECT status, "suspendedUntil" FROM "User" WHERE id = $1`, [elias]))!;
    expect(u.status).toBe("ACTIVE");
    expect(u.suspendedUntil).toBeNull();
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "Notification" WHERE "recipientId" = $1 AND type = 'MODERATION' AND data->>'message' LIKE '%Sperre deines Kontos ist abgelaufen%'`, [elias]))!.n).toBeGreaterThan(0);

    // Noch laufende Sperre bleibt
    await sql(`UPDATE "User" SET status = 'SUSPENDED', "suspendedUntil" = now() + interval '1 day' WHERE id = $1`, [elias]);
    runServer(`import("./src/server/moderation/expiry").then((m) => m.liftExpiredSuspensions())`);
    expect((await one<{ status: string }>(`SELECT status FROM "User" WHERE id = $1`, [elias]))!.status).toBe("SUSPENDED");

    // Gebannt: Moderationsentscheid geht per Mail raus, andere Neuigkeiten nicht
    await sql(`UPDATE "User" SET status = 'BANNED', "suspendedUntil" = NULL WHERE id = $1`, [elias]);
    await sql(`UPDATE "Notification" SET "emailedAt" = now() WHERE "emailedAt" IS NULL`);
    await sql(
      `INSERT INTO "Notification" (id, "recipientId", type, data, "createdAt", "updatedAt") VALUES
       ('e2e_mod_mail', $1, 'MODERATION', '{"kind":"ACCOUNT","message":"E2E Entscheid"}', now() - interval '5 minutes', now()),
       ('e2e_like_mail', $1, 'LIKE', '{}', now() - interval '5 minutes', now())`,
      [elias],
    );
    const out = runServer(`import("./src/server/notifications-mail").then((m) => m.sendEmails("instant"))`);
    const mails = out.split("\n").filter((l) => l.includes('"mail (dev)"'));
    expect(mails.some((l) => l.includes("el…@"))).toBe(true);
    const own = mails.filter((l) => l.includes("el…@"));
    expect(own.length).toBe(1);
    // Nur der Entscheid – das „Gefällt mir“ wird für gebannte Konten nicht verschickt
    expect(own[0]).not.toContain("Neuigkeiten");
    expect((await one<{ emailedAt: Date | null }>(`SELECT "emailedAt" FROM "Notification" WHERE id = 'e2e_mod_mail'`))!.emailedAt).not.toBeNull();
  } finally {
    await sql(`DELETE FROM "Notification" WHERE id IN ('e2e_mod_mail', 'e2e_like_mail')`);
    await sql(`UPDATE "User" SET status = $2::"AccountStatus", "suspendedUntil" = $3 WHERE id = $1`, [elias, before.status, before.suspendedUntil]);
  }
});
