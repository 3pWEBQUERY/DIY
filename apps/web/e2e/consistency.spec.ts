import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

/** Paket C: gleichzeitige Aufrufe dürfen Limits und Zähler nicht verfälschen. */

test("Wettbewerb: parallele Stimmen halten das Limit, Doppelklick und doppeltes Entfernen bleiben folgenlos", async () => {
  const mattia = await userId("mattia");
  const community = (await one<{ id: string }>(`SELECT id FROM "Community" WHERE slug = 'werkbank-holz'`))!.id;
  await sql(`DELETE FROM "CommunityChallenge" WHERE id = 'e2e_race'`);
  await sql(
    `INSERT INTO "CommunityChallenge" (id, "communityId", title, "startsAt", "endsAt", "votingEndsAt", "createdById", notified, "entryCount")
     VALUES ('e2e_race', $1, 'E2E Gleichzeitig', now() - interval '10 days', now() - interval '1 hour', now() + interval '3 days', $2, ARRAY['start','voting'], 0)`,
    [community, mattia],
  );
  // Fünf Einreichungen anderer Personen (je ein öffentliches Projekt)
  const owners = await sql<{ userId: string; projectId: string }>(
    `SELECT DISTINCT ON (p."ownerId") p."ownerId" "userId", p.id "projectId" FROM "Project" p
     WHERE p."ownerId" <> $1 AND p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC' ORDER BY p."ownerId", p."createdAt" DESC LIMIT 5`,
    [mattia],
  );
  test.skip(owners.length < 5, "Zu wenige Projekte in den Testdaten");
  for (const [i, o] of owners.entries()) {
    await sql(`INSERT INTO "ChallengeEntry" (id, "challengeId", "userId", "projectId", state, "createdAt", "updatedAt") VALUES ($1, 'e2e_race', $2, $3, 'ACTIVE', now(), now())`, [`e2e_race_${i}`, o.userId, o.projectId]);
  }
  await sql(`UPDATE "CommunityChallenge" SET "entryCount" = 5 WHERE id = 'e2e_race'`);

  try {
    const me = `{ id: "${mattia}", role: "MEMBER" } as never`;
    // 5 Stimmen gleichzeitig auf 5 verschiedene Einreichungen → höchstens 3 dürfen durchgehen
    runServer(`import("./src/server/communities/competitions").then(async (m) => {
      const r = await Promise.allSettled([0,1,2,3,4].map((i) => m.voteEntry(${me}, "e2e_race_" + i, true)));
      process.stdout.write("OK=" + r.filter((x) => x.status === "fulfilled").length);
    })`);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "ChallengeVote" WHERE "challengeId" = 'e2e_race' AND "userId" = $1`, [mattia]))!.n).toBe(3);
    expect((await one<{ n: number }>(`SELECT sum("voteCount")::int n FROM "ChallengeEntry" WHERE "challengeId" = 'e2e_race'`))!.n).toBe(3);

    // Doppelklick: eine Stimme zurücknehmen, dann zweimal gleichzeitig auf eine noch nicht gewählte Einreichung
    const voted = (await one<{ entryId: string }>(`SELECT "entryId" FROM "ChallengeVote" WHERE "challengeId" = 'e2e_race' AND "userId" = $1 LIMIT 1`, [mattia]))!.entryId;
    const fresh = (await one<{ id: string }>(`SELECT id FROM "ChallengeEntry" e WHERE "challengeId" = 'e2e_race' AND id <> 'e2e_race_4' AND NOT EXISTS (SELECT 1 FROM "ChallengeVote" v WHERE v."entryId" = e.id AND v."userId" = $1) LIMIT 1`, [mattia]))!.id;
    const out = runServer(`import("./src/server/communities/competitions").then(async (m) => {
      await m.voteEntry(${me}, "${voted}", false);
      const r = await Promise.allSettled([m.voteEntry(${me}, "${fresh}", true), m.voteEntry(${me}, "${fresh}", true)]);
      process.stdout.write("REJ=" + r.filter((x) => x.status === "rejected").length);
    })`);
    expect(out).toContain("REJ=0");
    expect((await one<{ n: number }>(`SELECT "voteCount" n FROM "ChallengeEntry" WHERE id = $1`, [fresh]))!.n).toBe(1);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "ChallengeVote" WHERE "challengeId" = 'e2e_race' AND "userId" = $1`, [mattia]))!.n).toBe(3);

    // Moderation entfernt dieselbe Einreichung zweimal gleichzeitig → Zähler sinkt nur einmal
    runServer(`import("./src/server/communities/competitions").then((m) => Promise.allSettled([m.removeEntry(${me}, "e2e_race_4"), m.removeEntry(${me}, "e2e_race_4")]))`);
    expect((await one<{ n: number }>(`SELECT "entryCount" n FROM "CommunityChallenge" WHERE id = 'e2e_race'`))!.n).toBe(4);
  } finally {
    await sql(`DELETE FROM "Notification" WHERE data->>'href' LIKE '%e2e_race%'`);
    await sql(`DELETE FROM "CommunityChallenge" WHERE id = 'e2e_race'`);
  }
});

test("Auszahlung: gleichzeitige Meldungen nur einmal, Endzustand wird nicht zurückgestuft", async () => {
  const lena = await userId("lena");
  const shop = (await one<{ id: string; stripeAccountId: string | null }>(`SELECT id, "stripeAccountId" FROM "Shop" WHERE "ownerId" = $1`, [lena]))!;
  await sql(`UPDATE "Shop" SET "stripeAccountId" = 'acct_e2e_payout' WHERE id = $1`, [shop.id]);
  await sql(`DELETE FROM "PayoutRecord" WHERE "providerRef" = 'po_e2e'`);
  const before = (await one<{ n: number }>(`SELECT count(*)::int n FROM "Notification" WHERE "recipientId" = $1 AND data->>'kind' = 'payout'`, [lena]))!.n;
  try {
    const p = (status: string) => `{ id: "po_e2e", amount: 4200, currency: "chf", status: "${status}", arrival_date: ${Math.floor(Date.now() / 1000)}, automatic: true }`;
    runServer(`import("./src/server/commerce/payouts").then(async (m) => {
      await m.recordPayout("acct_e2e_payout", ${p("in_transit")});
      await Promise.all([m.recordPayout("acct_e2e_payout", ${p("paid")}), m.recordPayout("acct_e2e_payout", ${p("paid")})]);
      // Verspätetes „unterwegs“ nach „gutgeschrieben“
      await m.recordPayout("acct_e2e_payout", ${p("in_transit")});
    })`);
    const rec = (await one<{ status: string; notified: string[] }>(`SELECT status, notified FROM "PayoutRecord" WHERE "providerRef" = 'po_e2e'`))!;
    expect(rec.status).toBe("paid");
    expect([...rec.notified].sort()).toEqual(["in_transit", "paid"]);
    const after = (await one<{ n: number }>(`SELECT count(*)::int n FROM "Notification" WHERE "recipientId" = $1 AND data->>'kind' = 'payout'`, [lena]))!.n;
    expect(after - before).toBe(2);
  } finally {
    await sql(`DELETE FROM "Notification" WHERE "recipientId" = $1 AND data->>'kind' = 'payout' AND data->>'amount' LIKE '%42.00%'`, [lena]);
    await sql(`DELETE FROM "PayoutRecord" WHERE "providerRef" = 'po_e2e'`);
    await sql(`UPDATE "Shop" SET "stripeAccountId" = $2 WHERE id = $1`, [shop.id, shop.stripeAccountId]);
  }
});

test("Produkt speichern aus altem Tab: Verkäufe seit dem Laden bleiben erhalten (kein Überverkauf)", async ({ browser }) => {
  const lena = await userId("lena");
  const prod = await one<{ id: string; invId: string; onHand: number; reserved: number; status: string }>(
    `SELECT p.id, i.id "invId", i."onHand", i.reserved, p.status FROM "Product" p JOIN "InventoryItem" i ON i."productId" = p.id AND i."variantId" IS NULL
     JOIN "Shop" s ON s.id = p."shopId" WHERE s."ownerId" = $1 AND p.kind IN ('SMALL_BATCH','KIT','RAW','MADE_TO_ORDER') AND p.status IN ('ACTIVE','SOLD_OUT')
     AND EXISTS (SELECT 1 FROM "ProductMedia" pm WHERE pm."productId" = p.id)
     AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p."createdAt" DESC LIMIT 1`,
    [lena],
  );
  test.skip(!prod, "Kein passendes Produkt");
  await sql(`UPDATE "InventoryItem" SET "onHand" = 3, reserved = 0 WHERE id = $1`, [prod!.invId]);
  try {
    const page = await loginAs(browser, "lena");
    await page.goto(`/studio/produkte/${prod!.id}`);
    const stock = page.getByLabel("Bestand (Stück)");
    await expect(stock).toHaveValue("3");
    // Inzwischen zwei Stück verkauft (anderer Tab / Kundschaft)
    await sql(`UPDATE "InventoryItem" SET "onHand" = 1 WHERE id = $1`, [prod!.invId]);
    await stock.fill("5");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(async () => (await one<{ onHand: number }>(`SELECT "onHand" FROM "InventoryItem" WHERE id = $1`, [prod!.invId]))!.onHand, { timeout: 10_000 }).toBe(3);
    // Erneut speichern ohne Änderung: bleibt 3 (nicht nochmals +2)
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.waitForTimeout(1500);
    expect((await one<{ onHand: number }>(`SELECT "onHand" FROM "InventoryItem" WHERE id = $1`, [prod!.invId]))!.onHand).toBe(3);
  } finally {
    await sql(`UPDATE "InventoryItem" SET "onHand" = $2, reserved = $3 WHERE id = $1`, [prod!.invId, prod!.onHand, prod!.reserved]);
    await sql(`UPDATE "Product" SET status = $2::"ProductStatus" WHERE id = $1`, [prod!.id, prod!.status]);
  }
});

test("Umfrage: gleichzeitige Stimmen für zwei Antworten zählen nur einmal", async () => {
  const mira = await userId("mira");
  const poll = await one<{ postId: string; pollId: string }>(
    `SELECT p.id "postId", pl.id "pollId" FROM "Poll" pl JOIN "Post" p ON p.id = pl."postId" WHERE pl."endsAt" > now() AND pl.multiple = false AND p.state = 'PUBLISHED' AND p."communityId" IS NULL AND p."authorId" <> $1 LIMIT 1`,
    [mira],
  );
  test.skip(!poll, "Keine laufende Umfrage");
  const opts = await sql<{ id: string }>(`SELECT id FROM "PollOption" WHERE "pollId" = $1 ORDER BY position LIMIT 2`, [poll!.pollId]);
  const before = (await one<{ v: number }>(`SELECT "voterCount" v FROM "Poll" WHERE id = $1`, [poll!.pollId]))!.v;
  await sql(`DELETE FROM "PollVote" WHERE "pollId" = $1 AND "userId" = $2`, [poll!.pollId, mira]);
  try {
    runServer(`import("./src/server/social/posts").then(async (m) => {
      const { db } = await import("./src/server/db");
      const u = (await db.user.findUniqueOrThrow({ where: { id: "${mira}" }, include: { profile: true } })) as never;
      await Promise.allSettled([m.votePoll(u, "${poll!.postId}", ["${opts[0]!.id}"]), m.votePoll(u, "${poll!.postId}", ["${opts[1]!.id}"])]);
    })`);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "PollVote" WHERE "pollId" = $1 AND "userId" = $2`, [poll!.pollId, mira]))!.n).toBe(1);
    expect((await one<{ v: number }>(`SELECT "voterCount" v FROM "Poll" WHERE id = $1`, [poll!.pollId]))!.v).toBe(before + 1);
  } finally {
    const votes = await sql<{ optionId: string }>(`DELETE FROM "PollVote" WHERE "pollId" = $1 AND "userId" = $2 RETURNING "optionId"`, [poll!.pollId, mira]);
    for (const v of votes) await sql(`UPDATE "PollOption" SET "voteCount" = "voteCount" - 1 WHERE id = $1`, [v.optionId]);
    if (votes.length) await sql(`UPDATE "Poll" SET "voterCount" = "voterCount" - 1 WHERE id = $1`, [poll!.pollId]);
  }
});
