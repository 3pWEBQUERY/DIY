import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { expect, type Browser, type Page } from "@playwright/test";

/** Gemeinsame Hilfen für die Browser-Tests. */

export const PASSWORD = process.env.DEMO_PASSWORD ?? "Werkraum-Demo-2026!";
export const USERS = {
  lena: { email: "lena-haekelt@demo.werkraum.local", handle: "lena.haekelt", name: "Lena Brunner" },
  mattia: { email: "mattia-holz@demo.werkraum.local", handle: "mattia.holz", name: "Mattia Rossi" },
  mira: { email: "mira-strickt@demo.werkraum.local", handle: "mira.strickt", name: "Mira Baumann" },
  elias: { email: "elias-garten@demo.werkraum.local", handle: "elias.garten", name: "Elias Frei" },
} as const;
export type Who = keyof typeof USERS;

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/werkraum";
let pool: pg.Pool | null = null;

/** SQL direkt gegen die Testdatenbank (Vorbereitung, Zeitsprünge, Prüfungen). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: DB, max: 2 });
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await sql<T>(text, params))[0];
}
export async function userId(who: Who) {
  return (await one<{ userId: string }>(`select "userId" from "UserProfile" where handle = $1`, [USERS[who].handle]))!.userId;
}

/** Serverfunktion direkt ausführen (z. B. Zahlung im Testmodus verbuchen, Worker-Job). */
export function runServer(code: string) {
  return execFileSync("npx", ["tsx", "--env-file-if-exists=.env", "--conditions=react-server", "-e", `${code}.then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})`], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    env: { ...process.env, DATABASE_URL: DB },
    encoding: "utf8",
  });
}

/** Anmeldungen je Person wiederverwenden – sonst greift im Gesamtlauf das Login-Limit (10 je 10 Min.). */
type StorageState = Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;
const sessions = new Map<Who, StorageState>();

/** Neue, angemeldete Seite (eigener Browser-Kontext). Nutzt eine bestehende Sitzung, solange sie gültig ist. */
export async function loginAs(browser: Browser, who: Who, opts: { viewport?: { width: number; height: number }; mobile?: boolean; fresh?: boolean } = {}): Promise<Page> {
  const ctxOpts = {
    viewport: opts.viewport,
    ...(opts.mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" } : {}),
  };
  const cached = !opts.fresh ? sessions.get(who) : undefined;
  if (cached) {
    const ctx = await browser.newContext({ ...ctxOpts, storageState: cached });
    const page = await ctx.newPage();
    failOnNativeDialogs(page);
    const res = await page.request.get("/api/v1/me");
    if (res.ok()) {
      await page.goto("/feed");
      return page;
    }
    sessions.delete(who);
    await ctx.close();
  }
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  failOnNativeDialogs(page);
  await page.goto("/anmelden");
  await page.fill('input[name="email"]', USERS[who].email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/anmelden")), page.click('button[type="submit"]')]);
  sessions.set(who, await ctx.storageState());
  return page;
}

/** Werkuno nutzt eigene Dialoge – ein Browser-Dialog (alert/confirm) ist ein Fehler. */
export function failOnNativeDialogs(page: Page) {
  page.on("dialog", async (d) => {
    await d.dismiss();
    expect(d.message(), "Browser-Dialog statt eigenem Dialog").toBe("");
  });
}

export const confirmDialog = (page: Page) => page.locator('dialog[aria-labelledby="confirm-title"]');
