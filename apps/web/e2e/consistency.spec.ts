import { expect, test } from "@playwright/test";
import { one, runServer, sql, userId } from "./helpers";

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
