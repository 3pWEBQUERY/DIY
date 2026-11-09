/**
 * WERKRAUM – Railway Infrastructure as Code (ersetzt railway.json, PRD §25.8).
 *
 *   railway link            # Projekt „WERKRAUM“ wählen
 *   railway config plan     # Änderungen prüfen
 *   railway config apply    # anwenden
 *
 * Beide App-Services bauen dasselbe Dockerfile im Repo-Root.
 */
import { bucket, defineRailway, github, group, postgres, preserve, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  const db = postgres("Postgres");
  const media = bucket("media", { region: "ams" });
  const source = github("3pwebquery/diy", { branch: ctx.environment === "production" ? "claude/werkraum-diy-platform-m9g2tc" : "main" });

  const storageEnv = {
    S3_ENDPOINT: media.env.ENDPOINT,
    S3_BUCKET: media.env.BUCKET,
    S3_REGION: media.env.REGION,
    S3_ACCESS_KEY_ID: media.env.ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: media.env.SECRET_ACCESS_KEY,
  };

  const web = service("web", {
    source,
    start: "pnpm start",
    preDeploy: "pnpm predeploy",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      SESSION_SECRET: ctx.shared.SESSION_SECRET,
      ADMIN_EMAIL: ctx.shared.ADMIN_EMAIL,
      ADMIN_PASSWORD: ctx.shared.ADMIN_PASSWORD,
      // Demo-Community nur ausserhalb der Produktion (in Produktion sperrt der Seed Demo-Logins mit Standardpasswort)
      SEED_DEMO: ctx.environment === "production" ? "false" : "true",
      DB_POOL_MAX: "8",
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      RESEND_API_KEY: preserve(),
      APPLE_IOS_CLIENT_ID: preserve(),
      ...storageEnv,
    },
  });

  const worker = service("worker", {
    source,
    // Direkt mit node (exec, ohne pnpm dazwischen): SIGTERM beim Neustart erreicht den Worker,
    // der sauber herunterfährt – sonst meldet pnpm bei jedem Deploy „ELIFECYCLE Command failed“
    start: "sh -c 'cd apps/web && exec node --conditions=react-server --import tsx src/worker/index.ts'",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}",
      SESSION_SECRET: ctx.shared.SESSION_SECRET,
      DB_POOL_MAX: "4",
      // Der Worker verschickt alle Benachrichtigungs-Mails und führt Stripe-Abgleich, Erstattungen,
      // Auszahlungen und Abo-Kündigungen aus – ohne diese Schlüssel laufen diese Jobs ins Leere
      RESEND_API_KEY: preserve(),
      MAIL_FROM: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      // iOS-Push wird vom Worker zugestellt
      APNS_KEY_ID: preserve(),
      APNS_TEAM_ID: preserve(),
      APNS_PRIVATE_KEY: preserve(),
      APNS_BUNDLE_ID: preserve(),
      ...storageEnv,
    },
  });

  return project("WERKRAUM", {
    resources: [group("App", [web, worker]), group("Daten", [db, media])],
  });
});
