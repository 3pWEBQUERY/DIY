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
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Ungültige Umgebungsvariablen: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "));
    }
    cached = parsed.data;
  }
  return cached;
}

export const features = {
  storage: () => Boolean(env().S3_BUCKET && env().S3_ACCESS_KEY_ID && env().S3_SECRET_ACCESS_KEY),
  payments: () => Boolean(env().STRIPE_SECRET_KEY),
  apple: () => Boolean(env().APPLE_CLIENT_ID && env().APPLE_TEAM_ID && env().APPLE_KEY_ID && env().APPLE_PRIVATE_KEY),
  email: () => Boolean(env().RESEND_API_KEY),
};
