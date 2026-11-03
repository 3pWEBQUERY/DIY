import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual, createHmac } from "node:crypto";

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) =>
    _scrypt(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** scrypt-Passwort-Hash im Format scrypt$N$r$p$salt$hash (§29.3). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) {
    // konstante Zeit auch ohne Hash, um User-Enumeration zu erschweren
    await scrypt("x", randomBytes(16), 64, PARAMS);
    return false;
  }
  const [algo, N, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hmac = (secret: string, v: string) => createHmac("sha256", secret).update(v).digest("hex");

/** Kurze, menschenlesbare Codes ohne verwechselbare Zeichen. */
export function humanCode(len = 5) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
