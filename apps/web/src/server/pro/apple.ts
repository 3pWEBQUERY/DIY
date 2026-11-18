import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { requireFlag } from "@/server/flags";
import { captureError } from "@/server/monitoring";
import { AppStoreVerificationError, verifyAppStoreJws, type AppStoreRenewalInfo, type AppStoreTransaction } from "@/server/commerce/appstore-verify";
import { isActiveSubscription, PRO_NAME, syncProFlag, tell } from "./service";

/**
 * Creator Pro als Auto-Renewable Subscription im App Store (Guideline 3.1.1: digitale Abos werden in
 * der App über Apple verkauft). Im Web läuft dasselbe Abo über Stripe – es gilt immer nur eines.
 *
 * Zuordnung zum Konto: Die App kauft mit `appAccountToken` = HMAC(Konto). Apple trägt das Token in
 * jede Transaktion und Verlängerung ein; ein Beleg lässt sich deshalb nicht auf ein anderes Konto
 * übertragen. Den Stand liefern die App (nach Kauf, Wiederherstellen, beim Start) und die
 * Server-Benachrichtigungen V2 von Apple (Verlängerung, Kündigung, Ablauf, Erstattung).
 */

export const PRO_APPLE_PRODUCTS = {
  "ch.werkuno.app.pro.monthly": "month",
  "ch.werkuno.app.pro.yearly": "year",
} as const;
export type ProAppleProductId = keyof typeof PRO_APPLE_PRODUCTS;
export const PRO_APPLE_PRODUCT_IDS = Object.keys(PRO_APPLE_PRODUCTS) as ProAppleProductId[];

export function isProAppleProduct(id: string | null | undefined): id is ProAppleProductId {
  return !!id && id in PRO_APPLE_PRODUCTS;
}

/** Stabiles appAccountToken (UUID-Format) je Konto – nicht umkehrbar, aber für den Server prüfbar. */
export function proAccountToken(userId: string) {
  const h = createHmac("sha256", env().SESSION_SECRET).update(`pro-apple:${userId}`).digest("hex");
  // Version 4 / Variante RFC 4122 setzen, damit StoreKit es sicher als UUID annimmt
  const v = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Beendende Meldungen: danach ist das Abo vorbei, auch wenn das Periodenende noch nicht erreicht ist. */
const TERMINAL = new Set(["EXPIRED", "GRACE_PERIOD_EXPIRED", "REVOKE", "REFUND"]);

type Applied = { changed: boolean; active: boolean };

/**
 * Apple-Stand übernehmen. `kind` sagt, woher er kommt: Die App liefert Kauf/Wiederherstellen, Apple die
 * Benachrichtigungen. Ältere Stände (nach `signedDate`) überschreiben einen neueren nie.
 */
async function applyAppleState(
  userId: string,
  t: AppStoreTransaction,
  renewal: AppStoreRenewalInfo | null,
  opts: { notificationType?: string; source: "app" | "notification" },
): Promise<Applied> {
  const interval = PRO_APPLE_PRODUCTS[t.productId as ProAppleProductId] ?? "month";
  const signedAt = new Date(Math.max(t.signedDate ?? 0, renewal?.signedDate ?? 0) || Date.now());
  const existing = await db.subscription.findUnique({ where: { userId } });

  // Bereits ein laufendes Web-Abo (Stripe/Testmodus) mit eigener Abrechnung → nicht überschreiben.
  // Doppelt bezahlt: zur manuellen Klärung melden; die Person kündigt das Apple-Abo in den Einstellungen.
  if (existing && existing.provider !== "apple" && existing.provider !== "comp" && isActiveSubscription(existing)) {
    await captureError(new Error(`${PRO_NAME}: Apple-Abo neben laufendem Web-Abo`), {
      source: "SERVER",
      path: "pro.apple_duplicate",
      userId,
      meta: { provider: existing.provider, originalTransactionId: t.originalTransactionId },
    });
    if (opts.source === "app") {
      throw fail.conflict(`Du hast ${PRO_NAME} bereits über die Website abgeschlossen. Bitte kündige das Abo im App Store wieder und beantrage bei Apple eine Erstattung.`);
    }
    return { changed: false, active: true };
  }
  // Anderes (älteres) Apple-Abo derselben Person: nur übernehmen, wenn das bisherige nicht mehr läuft
  if (existing?.provider === "apple" && existing.appleOriginalTransactionId && existing.appleOriginalTransactionId !== t.originalTransactionId && isActiveSubscription(existing)) {
    return { changed: false, active: true };
  }
  // Verspätete Meldung: ein neuerer Stand ist schon übernommen
  if (existing?.provider === "apple" && existing.appleOriginalTransactionId === t.originalTransactionId && existing.appleSignedAt && existing.appleSignedAt > signedAt) {
    return { changed: false, active: isActiveSubscription(existing) };
  }

  const expires = t.expiresDate ? new Date(t.expiresDate) : null;
  const grace = renewal?.gracePeriodExpiresDate ? new Date(renewal.gracePeriodExpiresDate) : null;
  const periodEnd = expires && grace && grace > expires ? grace : expires;
  const ended = !!t.revocationDate || (!!opts.notificationType && TERMINAL.has(opts.notificationType));
  const status = ended ? "canceled" : renewal?.isInBillingRetryPeriod ? "past_due" : "active";
  const cancelAtPeriodEnd = renewal ? renewal.autoRenewStatus === 0 : (existing?.provider === "apple" ? existing.cancelAtPeriodEnd : false);

  const before = existing ? isActiveSubscription(existing) : false;
  const data = {
    plan: "PRO",
    interval,
    status,
    provider: "apple",
    // Apple meldet Preise in Tausendsteln der Währung (9000 = 9.00)
    priceMinor: typeof t.price === "number" ? Math.round(t.price / 10) : (existing?.priceMinor ?? null),
    currency: (t.currency ?? existing?.currency ?? "CHF").toUpperCase(),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    subscriptionId: null,
    grantedById: null,
    appleOriginalTransactionId: t.originalTransactionId,
    appleEnvironment: t.environment,
    appleSignedAt: signedAt,
  };
  const row = await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const after = isActiveSubscription(row);
  if (before !== after) await syncProFlag(userId);
  if (!before && after) {
    await tell(userId, `Willkommen bei ${PRO_NAME}! Deine Pro-Werkzeuge sind jetzt freigeschaltet.`);
    await audit({ action: "pro.apple_subscribed", actorId: userId, targetType: "USER", targetId: userId, meta: { productId: t.productId, environment: t.environment } });
  }
  if (before && !after) {
    await tell(userId, t.revocationDate ? `Apple hat dein ${PRO_NAME}-Abo erstattet. Deine Inhalte bleiben selbstverständlich erhalten.` : `Dein ${PRO_NAME}-Abo ist beendet. Deine Inhalte bleiben selbstverständlich erhalten.`);
  }
  if (opts.notificationType === "DID_FAIL_TO_RENEW" && after) {
    await tell(userId, `Apple konnte dein ${PRO_NAME}-Abo nicht verlängern. Bitte prüfe deine Zahlungsangaben im App Store – Pro bleibt vorerst aktiv.`);
  }
  return { changed: before !== after, active: after };
}

function verify<T>(jws: string): T {
  try {
    return verifyAppStoreJws<T>(jws);
  } catch (e) {
    if (e instanceof AppStoreVerificationError) throw fail.invalid(`Der Beleg von Apple konnte nicht geprüft werden (${e.message}).`);
    throw e;
  }
}

/** Daten für den Abo-Bildschirm der App: Produkte und das Konto-Token für den Kauf. */
export async function appleProOffer(userId: string) {
  return { productIds: PRO_APPLE_PRODUCT_IDS, appAccountToken: proAccountToken(userId) };
}

/**
 * Kauf, Wiederherstellen oder Abgleich aus der App: signierte Transaktion (und optional der
 * Verlängerungsstatus) des Pro-Abos. Prüft Signatur, App, Produkt und Konto-Zuordnung.
 */
export async function syncAppleProFromApp(user: { id: string }, input: { signedTransaction?: unknown; signedRenewalInfo?: unknown }) {
  await requireFlag("pro", user.id);
  const signed = typeof input.signedTransaction === "string" ? input.signedTransaction : "";
  if (!signed) throw fail.invalid("Kaufbeleg fehlt.", { signedTransaction: "Pflichtfeld" });
  const t = verify<AppStoreTransaction>(signed);
  if (t.bundleId !== env().APPLE_IAP_BUNDLE_ID) throw fail.invalid("Der Kaufbeleg gehört zu einer anderen App.");
  if (!isProAppleProduct(t.productId)) throw fail.invalid("Der Kaufbeleg gehört nicht zu Creator Pro.");
  if ((t.appAccountToken ?? "").toLowerCase() !== proAccountToken(user.id)) {
    throw fail.forbidden(`Dieses ${PRO_NAME}-Abo gehört zu einem anderen Werkuno-Konto. Melde dich mit jenem Konto an.`);
  }
  const owner = await db.subscription.findUnique({ where: { appleOriginalTransactionId: t.originalTransactionId }, select: { userId: true } });
  if (owner && owner.userId !== user.id) throw fail.forbidden(`Dieses ${PRO_NAME}-Abo gehört zu einem anderen Werkuno-Konto.`);

  let renewal: AppStoreRenewalInfo | null = null;
  if (typeof input.signedRenewalInfo === "string" && input.signedRenewalInfo) {
    const r = verify<AppStoreRenewalInfo>(input.signedRenewalInfo);
    if (r.originalTransactionId === t.originalTransactionId) renewal = r;
  }
  await applyAppleState(user.id, t, renewal, { source: "app" });
}

/**
 * Server-Benachrichtigung V2 zu einem Pro-Abo. Liefert false, wenn das Abo (noch) keinem Konto
 * zugeordnet ist – die App meldet es nach dem Kauf selbst.
 */
export async function handleAppleProNotification(notificationType: string, t: AppStoreTransaction, signedRenewalInfo?: string) {
  const sub = await db.subscription.findUnique({ where: { appleOriginalTransactionId: t.originalTransactionId }, select: { userId: true } });
  if (!sub) return false;
  let renewal: AppStoreRenewalInfo | null = null;
  if (signedRenewalInfo) {
    const r = verifyAppStoreJws<AppStoreRenewalInfo>(signedRenewalInfo);
    if (r.originalTransactionId === t.originalTransactionId) renewal = r;
  }
  await applyAppleState(sub.userId, t, renewal, { notificationType, source: "notification" });
  return true;
}
