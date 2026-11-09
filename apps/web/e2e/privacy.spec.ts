import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

/** Paket B: Datenexport, Koautor:innen und Blockieren, Sitemap, Handy-Ansicht ohne seitliches Scrollen. */

test("Datenexport: alle Bereiche, keine Geheimnisse", async ({ browser }) => {
  const page = await loginAs(browser, "lena");
  const res = await page.request.get("/api/v1/me/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("werkuno-daten-");
  const text = await res.text();
  const data = JSON.parse(text);
  for (const k of ["konto", "inhalte", "netzwerk", "sammlungen", "nachrichten", "marktplatz", "verfahren", "benachrichtigungen"]) expect(data).toHaveProperty(k);
  expect(data.konto.user.email).toBe("lena-haekelt@demo.werkraum.local");
  expect(data.marktplatz.shop?.slug).toBeTruthy();
  for (const secret of ["passwordHash", "totpSecret", "tokenHash", "codeHash", "p256dh"]) expect(text).not.toContain(`"${secret}"`);
});

test("Koautor:innen: Blockieren löst die Nennung, Community-Beiträge erlauben keine", async () => {
  const lena = await userId("lena");
  const mattia = await userId("mattia");
  const post = (await one<{ id: string }>(`SELECT id FROM "Post" WHERE "authorId" = $1 AND state = 'PUBLISHED' AND "communityId" IS NULL AND "repostOfId" IS NULL ORDER BY "createdAt" DESC LIMIT 1`, [lena]))!;
  await sql(`DELETE FROM "PostCoauthor" WHERE "postId" = $1`, [post.id]);
  await sql(`INSERT INTO "PostCoauthor" ("postId", "userId", "invitedById", status, "createdAt") VALUES ($1, $2, $3, 'ACCEPTED', now())`, [post.id, mattia, lena]);
  try {
    runServer(`import("./src/server/social/interactions").then((m) => m.setBlock({ id: "${mattia}" } as never, "${lena}", true))`);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "PostCoauthor" WHERE "postId" = $1`, [post.id]))!.n).toBe(0);
  } finally {
    runServer(`import("./src/server/social/interactions").then((m) => m.setBlock({ id: "${mattia}" } as never, "${lena}", false))`);
  }
  const cpost = await one<{ id: string; authorId: string }>(`SELECT id, "authorId" FROM "Post" WHERE "communityId" IS NOT NULL AND state = 'PUBLISHED' AND "repostOfId" IS NULL LIMIT 1`);
  test.skip(!cpost, "Kein Community-Beitrag in den Testdaten");
  expect(() => runServer(`import("./src/server/social/coauthors").then((m) => m.inviteCoauthors({ id: "${cpost!.authorId}" } as never, "${cpost!.id}", ["mira.strickt"]))`)).toThrow(/Communities sind keine Koautor/);
});

test("Sitemap enthält Materialseiten und Wettbewerbe", async ({ request }) => {
  // Aufgeteilte Sitemaps (je Bereich) – Materialien und statische Seiten stehen im Teil „basis“
  const xml = await (await request.get("/sitemap/basis.xml")).text();
  expect(xml).toContain("/materialien/merinowolle");
  expect(xml).toContain("/wettbewerbe</loc>");
});

test("Handy: kein seitliches Scrollen auf Listen- und Tabellenseiten", async ({ browser }) => {
  const page = await loginAs(browser, "lena", { viewport: { width: 390, height: 844 }, mobile: true });
  for (const path of ["/entdecken", "/materialien", "/suche?q=holz", "/studio/produkte", "/studio/bestellungen", "/materialien/merinowolle"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, `${path} ist breiter als der Bildschirm`).toBeLessThanOrEqual(cw + 1);
  }
});
