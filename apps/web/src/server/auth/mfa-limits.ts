import "server-only";
import type { LIMITS } from "@/server/ratelimit";

/**
 * Woher ein Versuch mit dem zweiten Faktor kommt:
 * - `scope`: Netzwerkadresse (Anmeldung, ausstehende Sitzung) bzw. Sitzungs-ID (angemeldete Sitzung)
 * - `trusted`: bekanntes Gerät der Inhaberin oder eine ihrer bestehenden, vollständig angemeldeten Sitzungen
 */
export type MfaSource = { scope: string; trusted: boolean };

export type MfaBucket = { action: keyof typeof LIMITS & `mfa${string}`; subject: string };

/**
 * Welche Zähler ein Versuch belegt (A-11: keine Aussperrung durch Dritte mit dem Passwort).
 *
 * - Kurzes Fenster (`mfaFail`, 10 je 15 Min.) je Konto UND Herkunft: Fehlversuche von einer fremden
 *   Adresse sperren nicht die Adresse/Sitzung der Inhaberin.
 * - Tageslimit je Konto (`mfaFailDay`, 30) für unbekannte Herkünfte: bleibt der eigentliche Schutz gegen
 *   das Durchprobieren 6-stelliger Codes, auch mit wechselnden Adressen.
 * - Bekannte Geräte und bestehende Sitzungen haben ein EIGENES Tageslimit (`mfaFailDayTrusted`) – wer nur das
 *   Passwort kennt, kann es nicht ausschöpfen. Insgesamt bleiben es höchstens 60 TOTP-Versuche je Tag.
 * - Wiederherstellungscodes (≈ 50 Bit Zufall) von bekannten Geräten/Sitzungen zählen nur im kurzen Fenster –
 *   sie werden nie durch ein Tageslimit blockiert; Durchprobieren ist bei dieser Länge aussichtslos.
 */
export function mfaBuckets(userId: string, src: MfaSource, kind: "totp" | "recovery"): MfaBucket[] {
  const buckets: MfaBucket[] = [];
  if (src.trusted) {
    if (kind === "totp") buckets.push({ action: "mfaFailDayTrusted", subject: userId });
  } else {
    buckets.push({ action: "mfaFailDay", subject: userId });
  }
  buckets.push({ action: "mfaFail", subject: `${userId}:${src.scope}` });
  return buckets;
}
