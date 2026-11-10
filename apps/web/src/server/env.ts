import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET muss mind. 32 Zeichen haben"),
  // Railway Bucket / S3
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  // Zahlungen
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  // E-Mail
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Werkuno <hallo@werkuno.ch>"),
  // Apple
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  // iOS-App: Bundle-ID als Audience des nativen identityToken
  APPLE_IOS_CLIENT_ID: z.string().optional(),
  // iOS-Push (APNs, tokenbasiert)
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  // Schlüssel der Audit-Kette (HMAC, mind. 32 Zeichen) – web und worker identisch, nie wechseln
  AUDIT_HMAC_KEY: z.string().optional(),
  // In-App-Käufe (App Store): Bundle-ID der App; lokale StoreKit-Tests aus Xcode nur in der Entwicklung
  APPLE_IAP_BUNDLE_ID: z.string().default("ch.werkuno.app"),
  APPLE_IAP_ALLOW_XCODE: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Ungültige Umgebungsvariablen: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "));
    }
    cached = parsed.data;
    // Einmal je Prozess loggen (Next lädt das Modul in Instrumentation und Routen getrennt)
    const g = globalThis as { __werkunoConfigWarned?: boolean };
    if (!g.__werkunoConfigWarned) {
      g.__werkunoConfigWarned = true;
      for (const w of configWarnings(cached)) console.error(JSON.stringify({ level: "error", msg: "config_warning", warning: w }));
    }
  }
  return cached;
}

/**
 * Fehlkonfigurationen, die die App nicht stoppen sollen, aber im Betrieb Schaden anrichten
 * (falsche Links in E-Mails, nicht geprüfte Stripe-Webhooks). Werden beim Start geloggt und in
 * Admin → System angezeigt.
 */
export function configWarnings(e: z.infer<typeof schema> = env()) {
  const w: string[] = [];
  if (e.NODE_ENV !== "production") return w;
  if (!process.env.APP_URL || /localhost|127\.0\.0\.1/.test(e.APP_URL)) w.push("APP_URL fehlt bzw. zeigt auf localhost – Links in E-Mails und Push-Nachrichten funktionieren nicht.");
  else if (!e.APP_URL.startsWith("https://")) w.push("APP_URL sollte mit https:// beginnen.");
  if (e.STRIPE_SECRET_KEY && !e.STRIPE_WEBHOOK_SECRET) w.push("STRIPE_WEBHOOK_SECRET fehlt – Zahlungsbestätigungen von Stripe können nicht geprüft werden.");
  if (e.STRIPE_SECRET_KEY && !e.STRIPE_CONNECT_WEBHOOK_SECRET) w.push("STRIPE_CONNECT_WEBHOOK_SECRET fehlt – Ereignisse der Verkäuferkonten (Verifizierung, Auszahlungen) kommen nur über den Abgleich an.");
  if (!e.RESEND_API_KEY) w.push("RESEND_API_KEY fehlt – es werden keine E-Mails verschickt.");
  if (!e.AUDIT_HMAC_KEY) w.push("AUDIT_HMAC_KEY fehlt – das Audit-Protokoll wird nur mit einfachem SHA-256 verkettet (mit DB-Schreibzugriff neu berechenbar).");
  else if (e.AUDIT_HMAC_KEY.trim().length < 32) w.push("AUDIT_HMAC_KEY ist kürzer als 32 Zeichen und wird ignoriert – das Audit-Protokoll läuft ohne Schlüssel.");
  if (!(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY)) w.push("S3-Speicher ist nicht eingerichtet – Uploads landen auf dem flüchtigen Dateisystem.");
  return w;
}

export const features = {
  storage: () => Boolean(env().S3_BUCKET && env().S3_ACCESS_KEY_ID && env().S3_SECRET_ACCESS_KEY),
  payments: () => Boolean(env().STRIPE_SECRET_KEY),
  apple: () => Boolean(env().APPLE_CLIENT_ID && env().APPLE_TEAM_ID && env().APPLE_KEY_ID && env().APPLE_PRIVATE_KEY),
  email: () => Boolean(env().RESEND_API_KEY),
};
