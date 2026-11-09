import { sql, userId } from "./helpers";

/**
 * Die Vorbereitung löscht tabellenweit (z. B. alle Rate-Limits, alle Koautorschaften). Nur gegen eine
 * lokale Test-Datenbank – E2E_BASE_URL erlaubt entfernte Ziele, DATABASE_URL könnte dann auf eine
 * echte Datenbank zeigen. Bewusst übersteuern: E2E_ALLOW_DESTRUCTIVE=1.
 */
export function assertDestructiveSetupAllowed(url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/werkraum") {
  if (process.env.E2E_ALLOW_DESTRUCTIVE === "1") return;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // Unix-Socket o. Ä. ohne Host gilt als lokal
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return;
  throw new Error(
    `E2E-Vorbereitung abgebrochen: DATABASE_URL zeigt auf „${host}“, nicht auf localhost. Die Tests löschen Daten – ` +
      "nur gegen eine lokale Test-Datenbank ausführen oder bewusst E2E_ALLOW_DESTRUCTIVE=1 setzen.",
  );
}

/**
 * Vorbereitung vor jedem Lauf: Ratenbegrenzung leeren, Überbleibsel früherer Läufe
 * entfernen und die nötigen Mitgliedschaften sicherstellen. Idempotent.
 */
export default async function globalSetup() {
  assertDestructiveSetupAllowed();
  await sql(`DELETE FROM "RateLimitBucket"`);
  await sql(`DELETE FROM "PostCoauthor"`);
  await sql(`DELETE FROM "ShoppingList" WHERE "ownerId" = $1 AND title LIKE 'Für: %'`, [await userId("mattia")]);
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
