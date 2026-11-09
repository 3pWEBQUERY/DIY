import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { storage } from "@/server/storage";
import { endProForDeletedAccount } from "@/server/pro/service";
import { markPaymentFailed } from "@/server/commerce/payments";
import { paymentsMode } from "@/server/commerce/stripe";
import { revokeAppleTokensForUser } from "@/server/identity/apple-token";

/**
 * Kontolöschung, Teil 2 (§23.1, DSG): Was `deleteAccount` nicht sofort in der Transaktion erledigt,
 * räumt der Worker nach dem Ereignis „UserDeleted“ auf. Idempotent – darf mehrfach laufen.
 *
 * Bleibt bewusst erhalten: Bestellungen/Zahlungen/Erstattungen (Aufbewahrungspflicht, ohne Profil),
 * Nachrichten in Unterhaltungen anderer (für die Gegenseite, Absender erscheint als „Gelöschtes Konto“),
 * Bewertungen (Teil der Shop-Historie, anonymisiert über das Profil), Audit-Log.
 */

/** Shop mit offenen Bestellungen kann nicht verschwinden – erst abschliessen bzw. stornieren. */
export const OPEN_SELLER_STATUSES = ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "PROBLEM"] as const;

export async function assertAccountDeletable(userId: string) {
  const open = await db.order.count({ where: { shop: { ownerId: userId }, status: { in: [...OPEN_SELLER_STATUSES] } } });
  if (open > 0) {
    throw fail.conflict(
      `Dein Shop hat noch ${open === 1 ? "eine offene Bestellung" : `${open} offene Bestellungen`}. Bitte versende oder storniere ${open === 1 ? "sie" : "sie"} zuerst – danach kannst du dein Konto löschen.`,
    );
  }
}

export async function purgeDeletedAccount(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, shop: { select: { stripeAccountId: true } } } });
  if (!user || user.status !== "DELETED") return { skipped: true };

  // 0. Sign in with Apple: gespeicherte Tokens bei Apple widerrufen (App Store 5.1.1(v)) – best effort
  await revokeAppleTokensForUser(userId).catch((e) => console.warn(JSON.stringify({ level: "warn", msg: "apple_revoke_failed", err: e instanceof Error ? e.message : String(e) })));

  // 1. Laufendes Creator-Pro-Abo sofort beenden (sonst bucht Stripe weiter ab)
  await endProForDeletedAccount(userId);

  // 2. Offene, noch unbezahlte eigene Bestellungen verwerfen → Reservierungen frei
  const pending = await db.order.findMany({ where: { buyerId: userId, status: "PENDING_PAYMENT" }, select: { id: true } });
  for (const o of pending) await markPaymentFailed(o.id, { kind: "abandoned", reason: "Konto gelöscht" }).catch(() => {});

  // 3. Shop-Guthaben: manuelle Auszahlung auf automatisch stellen, damit Restguthaben ausbezahlt wird
  if (user.shop?.stripeAccountId && paymentsMode() === "stripe") {
    const { updatePayoutSchedule } = await import("@/server/commerce/stripe");
    await updatePayoutSchedule(user.shop.stripeAccountId, { interval: "daily" }).catch(() => {});
  }

  // 4. Persönliche Daten ohne Aufbewahrungspflicht entfernen (Reihenfolge ohne Transaktion – idempotent)
  await db.pushDevice.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.verificationToken.deleteMany({ where: { userId } });
  await db.mfaRecoveryCode.deleteMany({ where: { userId } });
  await db.customerDetails.deleteMany({ where: { userId } });
  await db.cart.deleteMany({ where: { userId } });
  await db.shoppingList.deleteMany({ where: { ownerId: userId } });
  await db.materialStock.deleteMany({ where: { userId } });
  await db.bookmark.deleteMany({ where: { userId } });
  await db.collection.deleteMany({ where: { ownerId: userId } });
  await db.reaction.deleteMany({ where: { userId } });
  await db.notification.deleteMany({ where: { recipientId: userId } });
  await db.postCoauthor.deleteMany({ where: { userId } });
  await db.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  await db.userMute.deleteMany({ where: { OR: [{ muterId: userId }, { mutedId: userId }] } });
  // Gründer:innen-Mitgliedschaft bleibt, damit die Community nicht verwaist (Übergabe durch die Plattform)
  await db.communityMember.deleteMany({ where: { userId, role: { not: "OWNER" } } });
  await db.eventAttendee.deleteMany({ where: { userId } });
  await db.tutorialProgress.deleteMany({ where: { userId } });
  await db.challengeEntry.updateMany({ where: { userId, state: "ACTIVE" }, data: { state: "REMOVED" } });
  await db.userPreference.deleteMany({ where: { userId } });

  // 5. Eigene Medien löschen (Dateien + Einträge). Produktbilder bleiben, solange Bestellungen sie zeigen.
  const st = storage();
  let removed = 0;
  for (;;) {
    const media = await db.media.findMany({ where: { ownerId: userId, productMedia: { none: {} } }, select: { id: true, storageKey: true, variants: true }, take: 200 });
    if (!media.length) break;
    for (const m of media) {
      await st.del(m.storageKey).catch(() => {});
      for (const url of Object.values((m.variants ?? {}) as Record<string, string>)) await st.del(url.replace(/^\/media\//, "")).catch(() => {});
    }
    removed += (await db.media.deleteMany({ where: { id: { in: media.map((m) => m.id) } } })).count;
  }
  return { skipped: false, mediaRemoved: removed };
}
