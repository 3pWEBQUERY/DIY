import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Zeitbasierte Einmalcodes (TOTP, RFC 6238) für Authenticator-Apps
 * (Google Authenticator, 1Password, Apple Passwörter, Microsoft Authenticator …).
 * SHA-1, 6 Stellen, 30-Sekunden-Schritte – der von allen Apps unterstützte Standard.
 */
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Ungültiges Base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Neues zufälliges Geheimnis (160 Bit), Base32 für die App. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

/** HOTP-Wert für einen Zeitschritt (RFC 4226 dynamische Kürzung). */
export function hotp(secretB32: string, step: number, digits = TOTP_DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/**
 * Prüft einen Code mit ±1 Schritt Toleranz (Uhrabweichung). Gibt den akzeptierten Schritt
 * zurück; Schritte ≤ `lastStep` werden abgelehnt (kein zweites Mal derselbe Code).
 */
export function verifyTotp(secretB32: string, code: string, lastStep: number | null | undefined, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const expected = Buffer.from(hotp(secretB32, s));
    if (timingSafeEqual(expected, Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = "Werkuno") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${q}`;
}

/* ───────── Verschlüsselung des Geheimnisses (at rest) ───────── */

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET fehlt");
  // Eigener Schlüssel für 2FA, abgeleitet vom Server-Geheimnis
  return createHash("sha256").update(`werkuno-totp:${secret}`).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/* ───────── Wiederherstellungscodes ───────── */

const RC_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne verwechselbare Zeichen

/** 10 Codes im Format xxxxx-xxxxx; gespeichert wird nur der Hash. */
export function generateRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(10);
    const chars = [...bytes].map((b) => RC_ALPHABET[b % RC_ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(`werkuno-rc:${normalizeRecoveryCode(code)}`).digest("hex");
