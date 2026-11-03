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
    preDeploy: "pnpm db:migrate && pnpm db:seed",
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
      SEED_DEMO: "true",
      DB_POOL_MAX: "8",
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      RESEND_API_KEY: preserve(),
      ...storageEnv,
    },
  });

  const worker = service("worker", {
    source,
    start: "pnpm worker",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}",
      SESSION_SECRET: ctx.shared.SESSION_SECRET,
      DB_POOL_MAX: "4",
      ...storageEnv,
    },
  });

  return project("WERKRAUM", {
    resources: [group("App", [web, worker]), group("Daten", [db, media])],
  });
});
