import { createHash } from "node:crypto";

/**
 * Deterministische UUID (Version-5-Format, SHA-1) aus einem beliebigen Schlüssel, z. B. der ID eines
 * Outbox-Ereignisses. pg-boss legt Jobs mit gleicher ID nur einmal an (ON CONFLICT DO NOTHING) –
 * so wird ein Ereignis auch bei einer Wiederholung nach einem Fehler nicht doppelt eingereiht.
 */
export function stableUuid(key: string, namespace = "werkuno") {
  const h = createHash("sha1").update(`${namespace}:${key}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
