import "server-only";

/**
 * Erkennung verdächtiger Zahlungshinweise in Nachrichten (Zahlung ausserhalb der Plattform).
 * Ergebnis ist nur ein Warnhinweis für die Empfänger:in (Flag SUSPICIOUS_PAYMENT_LINK) – deshalb
 * lieber etwas grosszügiger, aber ohne Alltagssätze („ich zahle 20 CHF für die Lieferung“) zu treffen.
 */

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\btwint\b/i,
  /paypal\.me\b/i,
  /\bpaypal\b[^.\n]{0,40}\b(freunde|friends|family|familie)\b/i,
  /\biban\b/i,
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/,
  /western\s*union/i,
  /moneygram/i,
  /\b(?:bezahl|zahl)\w*\s+(?:(?:lieber|direkt|einfach|bitte|gerne?)\s+)*(?:ausserhalb|privat|direkt|per\s+(?:bank)?(?:ü|ue)berweisung|vorab|im\s+voraus)/i,
  /ausserhalb\s+(?:der\s+|von\s+)?(?:plattform|werkuno|werkraum|app|website|seite)/i,
  /\bvorkasse\b/i,
  /\bvorauszahlung/i,
  // „Banküberweisung vorab“, „Überweisung direkt an mich“, „überweise im Voraus“
  /(?:ü|ue)berweis\w*\s+(?:(?:bitte|lieber|einfach|gerne?|mir|es|das|den\s+betrag|das\s+geld)\s+)*(?:vorab|im\s+voraus|direkt|privat|ausserhalb)/i,
  // „vorab überweisen“, „im Voraus bezahlen“, „vorab zahlen“
  /(?:\bvorab|\bim\s+voraus)\s+(?:\w+\s+){0,2}?(?:(?:ü|ue)berweis|bezahl|zahl(?:en|st|t|e)?\b)/i,
  /\b(?:bit\.ly|tinyurl\.com|t\.ly|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|goo\.gl)\b/i,
  /\bwa\.me\//i,
  /\b(?:bitcoin|btc|usdt|krypto\w*|crypto)\b/i,
  /\b(?:google[- ]?play|itunes|apple|amazon|paysafe)[- ]?(?:karte|card|gutschein|code)\b/i,
  /\brevolut\.me\b/i,
];

/** Länge der IBAN je Land (häufige Länder in Europa). */
const IBAN_LENGTH: Record<string, number> = {
  CH: 21, LI: 21, DE: 22, AT: 20, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, LU: 20, GB: 22, IE: 22, PT: 25, PL: 28, CZ: 24, SK: 24,
  HU: 28, SI: 19, HR: 21, DK: 18, SE: 24, NO: 15, FI: 18, MC: 27, SM: 27, GR: 27, RO: 24, BG: 22, LT: 20, LV: 21, EE: 20, MT: 31,
  CY: 28, IS: 26, TR: 26,
};

/** Prüfziffer nach ISO 13616 (mod 97 = 1). */
function ibanChecksumOk(iban: string) {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/**
 * IBAN in beliebiger Schreibweise: klein, mit Leer-, Punkt- oder Bindestrich-Trennern.
 * Ohne feste Grossschreibung wäre das Muster allein zu ungenau – deshalb zählt nur eine IBAN
 * mit passender Landeslänge und gültiger Prüfziffer.
 */
function containsIban(text: string) {
  for (const m of text.matchAll(/(?<![a-z0-9])([a-z]{2})(\d{2})((?:[ .\-]?[a-z0-9]){11,30})/gi)) {
    const cc = m[1]!.toUpperCase();
    const len = IBAN_LENGTH[cc];
    if (!len) continue;
    const compact = (cc + m[2] + m[3]!.replace(/[ .\-]/g, "")).toUpperCase();
    if (compact.length >= len && ibanChecksumOk(compact.slice(0, len))) return true;
  }
  return false;
}

/**
 * Vereinheitlicht Schreibweisen, mit denen sich die Muster umgehen liessen:
 * Kompatibilitätszeichen (NFKC), unsichtbare Formatzeichen mitten im Wort („tw<ZWSP>int“, weiches
 * Trennzeichen) und „ß“ → „ss“ (Schweizer Schreibweise der Muster).
 */
export function normalizeForDetection(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[\p{Cf}\u034F]/gu, "")
    .replace(/ß/g, "ss")
    .replace(/ẞ/g, "SS");
}

export function detectSuspiciousPayment(text: string) {
  const t = normalizeForDetection(text);
  return SUSPICIOUS_PATTERNS.some((r) => r.test(t)) || containsIban(t);
}
