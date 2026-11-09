import { sql, userId } from "./helpers";

/**
 * Vorbereitung vor jedem Lauf: Ratenbegrenzung leeren, Überbleibsel früherer Läufe
 * entfernen und die nötigen Mitgliedschaften sicherstellen. Idempotent.
 */
export default async function globalSetup() {
  await sql(`DELETE FROM "RateLimitBucket"`);
  await sql(`DELETE FROM "PostCoauthor"`);
  await sql(`DELETE FROM "CommunityChallenge" WHERE title LIKE 'E2E%'`);
  await sql(`DELETE FROM "Notification" WHERE data->>'message' LIKE '%E2E %'`);
  await sql(`DELETE FROM "Post" WHERE body LIKE 'E2E Koautoren%'`);
  await sql(`DELETE FROM "Product" WHERE title LIKE 'E2E%'`).catch(() => {});
  await sql(`DELETE FROM "Subscription" WHERE "userId" = $1`, [await userId("lena")]);
  await sql(`UPDATE "UserProfile" SET "isCreatorPro" = false, "featuredProjectIds" = ARRAY[]::text[], "mediaKitPublic" = false WHERE handle = 'lena.haekelt'`);
  // Käufer ohne gespeicherte Angaben, leerer Warenkorb
  const elias = await userId("elias");
  await sql(`DELETE FROM "CustomerDetails" WHERE "userId" = $1`, [elias]);
  await sql(`DELETE FROM "Review" WHERE "authorId" = $1`, [elias]);
  await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
  // Lena und Mira sind Mitglieder in „Werkbank Holz“ (Mattia leitet sie)
  const community = (await sql<{ id: string }>(`SELECT id FROM "Community" WHERE slug = 'werkbank-holz'`))[0]!.id;
  for (const who of ["lena", "mira"] as const) {
    await sql(
      `INSERT INTO "CommunityMember" ("communityId", "userId", role, state, "joinedAt") VALUES ($1, $2, 'MEMBER', 'ACTIVE', now())
       ON CONFLICT ("communityId", "userId") DO UPDATE SET state = 'ACTIVE'`,
      [community, await userId(who)],
    );
  }
}
