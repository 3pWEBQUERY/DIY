import "server-only";
import { X509Certificate, verify as verifySignature } from "node:crypto";

/**
 * Prüfung signierter App-Store-Daten (JWS, StoreKit 2 / App Store Server Notifications V2).
 *
 * Apple signiert jede Transaktion und jede Server-Benachrichtigung als JWS (ES256). Der Header
 * enthält die Zertifikatskette `x5c` = [Blatt, Zwischenzertifikat, Apple Root CA – G3].
 * Wir prüfen:
 *  1. Wurzel = Apple Root CA – G3 (über den SHA-256-Fingerabdruck fest verankert),
 *  2. Zwischenzertifikat ist von der Wurzel, Blatt vom Zwischenzertifikat signiert,
 *  3. Apple-Kennzeichnungen (OIDs) auf Blatt und Zwischenzertifikat, Gültigkeitszeitraum,
 *  4. die JWS-Signatur mit dem Schlüssel des Blattzertifikats.
 *
 * Nur ausserhalb der Produktion (und nur mit APPLE_IAP_ALLOW_XCODE=true) werden Käufe aus dem
 * lokalen StoreKit-Test in Xcode akzeptiert; diese sind mit einem selbstsignierten Zertifikat signiert.
 */

/** SHA-256-Fingerabdruck von „Apple Root CA - G3“ (https://www.apple.com/certificateauthority/). */
const APPLE_ROOT_CA_G3_SHA256 = "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

// DER-Kodierung der Apple-OIDs: 1.2.840.113635.100.6.11.1 (Blatt) und 1.2.840.113635.100.6.2.1 (Zwischenzertifikat)
const OID_LEAF = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);
const OID_INTERMEDIATE = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);

export class AppStoreVerificationError extends Error {}

export type AppStoreEnvironment = "Production" | "Sandbox" | "Xcode" | "LocalTesting";

/** Entschlüsselte Transaktion (JWSTransactionDecodedPayload, Auszug). */
export type AppStoreTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  type: string;
  quantity?: number;
  appAccountToken?: string;
  environment: AppStoreEnvironment;
  price?: number;
  currency?: string;
  storefront?: string;
  signedDate?: number;
  revocationDate?: number;
  revocationReason?: number;
};

/** Server-Benachrichtigung V2 (ResponseBodyV2DecodedPayload, Auszug). */
export type AppStoreNotification = {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate?: number;
  data?: { bundleId?: string; environment?: AppStoreEnvironment; signedTransactionInfo?: string };
};

function b64url(input: string) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function rootFingerprint() {
  return (process.env.APPLE_ROOT_CA_SHA256 || APPLE_ROOT_CA_G3_SHA256).replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function validAt(cert: X509Certificate, at: Date) {
  return new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);
}

export function allowXcodeSigned() {
  return process.env.NODE_ENV !== "production" && process.env.APPLE_IAP_ALLOW_XCODE === "true";
}

/** JWS prüfen und Nutzlast zurückgeben. Wirft AppStoreVerificationError bei jedem Fehler. */
export function verifyAppStoreJws<T>(jws: string): T {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3) throw new AppStoreVerificationError("Ungültiges Format.");
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; x5c?: string[] };
  let payload: T & { environment?: string; signedDate?: number };
  try {
    header = JSON.parse(b64url(h).toString("utf8"));
    payload = JSON.parse(b64url(p).toString("utf8"));
  } catch {
    throw new AppStoreVerificationError("Ungültiges Format.");
  }
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length === 0) throw new AppStoreVerificationError("Unbekannte Signatur.");
  let certs: X509Certificate[];
  try {
    certs = header.x5c.map((c) => new X509Certificate(Buffer.from(c, "base64")));
  } catch {
    throw new AppStoreVerificationError("Ungültiges Zertifikat.");
  }
  const leaf = certs[0]!;
  const env = (payload as { environment?: string; data?: { environment?: string } }).environment ?? (payload as { data?: { environment?: string } }).data?.environment;
  const isLocal = env === "Xcode" || env === "LocalTesting";

  if (isLocal) {
    // Lokaler StoreKit-Test: selbstsigniert, nur in der Entwicklung zulassen
    if (!allowXcodeSigned()) throw new AppStoreVerificationError("Testkäufe aus Xcode werden hier nicht angenommen.");
  } else {
    if (certs.length !== 3) throw new AppStoreVerificationError("Unvollständige Zertifikatskette.");
    const [, intermediate, root] = certs as [X509Certificate, X509Certificate, X509Certificate];
    if (root.fingerprint256.replace(/:/g, "").toUpperCase() !== rootFingerprint()) throw new AppStoreVerificationError("Unbekannte Wurzelzertifizierungsstelle.");
    if (!root.verify(root.publicKey)) throw new AppStoreVerificationError("Wurzelzertifikat ungültig.");
    if (!intermediate.verify(root.publicKey)) throw new AppStoreVerificationError("Zwischenzertifikat ungültig.");
    if (!leaf.verify(intermediate.publicKey)) throw new AppStoreVerificationError("Blattzertifikat ungültig.");
    if (!leaf.raw.includes(OID_LEAF) || !intermediate.raw.includes(OID_INTERMEDIATE)) throw new AppStoreVerificationError("Kein Apple-Zertifikat.");
    // Gültigkeit zum Signaturzeitpunkt (wie Apples eigene Bibliothek), sonst jetzt
    const at = payload.signedDate ? new Date(payload.signedDate) : new Date();
    for (const c of certs) if (!validAt(c, at)) throw new AppStoreVerificationError("Zertifikat abgelaufen.");
  }

  const ok = verifySignature("sha256", Buffer.from(`${h}.${p}`), { key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, b64url(s));
  if (!ok) throw new AppStoreVerificationError("Signatur ungültig.");
  return payload;
}
