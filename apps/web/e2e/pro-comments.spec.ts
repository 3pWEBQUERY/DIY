import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Creator Pro: Wortfilter (ausgeblendet nur für Autor:in und Inhaber:in), Kommentar anheften,
 * Kommentare schliessen und eigenes Profil-Design (Farbe, Titelbild, Reihenfolge der Bereiche).
 */
test.describe.serial("Creator Pro: Kommentare und Profil-Design", () => {
  let mattia = "";
  let hadSub = false;
  let project = { id: "", slug: "" };
  const tag = Date.now().toString(36);

  test.beforeAll(async () => {
    mattia = await userId("mattia");
    hadSub = !!(await one(`SELECT 1 FROM "Subscription" WHERE "userId" = $1`, [mattia]));
    if (!hadSub) await sql(`INSERT INTO "Subscription" (id, "userId", interval, status, provider, "updatedAt") VALUES ($1, $2, 'comp', 'active', 'comp', now())`, [`e2e_sub_${tag}`, mattia]);
    project = (await one<{ id: string; slug: string }>(`SELECT id, slug FROM "Project" WHERE "ownerId" = $1 AND state = 'PUBLISHED' AND visibility = 'PUBLIC' ORDER BY "createdAt" LIMIT 1`, [mattia]))!;
    await sql(`UPDATE "Project" SET "commentsLockedAt" = NULL WHERE id = $1`, [project.id]);
    await sql(`UPDATE "Comment" SET "pinnedAt" = NULL WHERE "targetId" = $1`, [project.id]);
  });

  test.afterAll(async () => {
    await sql(`UPDATE "UserProfile" SET "commentFilterWords" = ARRAY[]::text[], "profileTheme" = NULL WHERE "userId" = $1`, [mattia]);
    await sql(`UPDATE "Project" SET "commentsLockedAt" = NULL WHERE id = $1`, [project.id]);
    await sql(`DELETE FROM "Comment" WHERE "targetId" = $1 AND body LIKE '%e2e${tag}%'`, [project.id]);
    if (!hadSub) await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND id = $2`, [mattia, `e2e_sub_${tag}`]);
  });

  const comments = async (page: import("@playwright/test").Page) => {
    const j = await (await page.request.get(`/api/v1/app/comments?type=PROJECT&id=${project.id}&paged=1`)).json();
    return ((j.data ?? j).items ?? []) as { id: string; body: string; pinned?: boolean; filtered?: boolean }[];
  };
  const commentCount = async () => (await one<{ n: number }>(`SELECT "commentCount" AS n FROM "Project" WHERE id = $1`, [project.id]))!.n;

  test("Wortfilter blendet aus, Einblenden zeigt allen, Anheften steht oben", async ({ browser }) => {
    const owner = await loginAs(browser, "mattia");
    const elias = await loginAs(browser, "elias");
    const lena = await loginAs(browser, "lena");

    const saved = await owner.request.put("/api/v1/app/studio/comment-filter", { data: { words: [`Sperrwort${tag}`] } });
    expect(saved.status(), await saved.text()).toBe(200);

    const before = await commentCount();
    const r = await elias.request.post("/api/v1/app/comments", { data: { type: "PROJECT", id: project.id, body: `Das ist sperrwort${tag} e2e${tag}` } });
    expect(r.status(), await r.text()).toBe(200);
    const { id } = (await r.json()).data ?? (await r.json());
    expect(await commentCount()).toBe(before);

    // Autor sieht den Kommentar normal, Dritte nicht, die Inhaberin markiert
    expect((await comments(elias)).find((c) => c.id === id)).toMatchObject({ filtered: false });
    expect((await comments(lena)).find((c) => c.id === id)).toBeUndefined();
    expect((await comments(owner)).find((c) => c.id === id)).toMatchObject({ filtered: true });

    // Studio: in der Liste, einblenden
    await owner.goto("/studio/kommentare");
    await expect(owner.getByText(`Das ist sperrwort${tag} e2e${tag}`)).toBeVisible();
    await owner.getByRole("button", { name: "Einblenden" }).first().click();
    await expect(owner.getByText("Kommentar eingeblendet.")).toBeVisible();
    expect((await comments(lena)).find((c) => c.id === id)).toBeTruthy();
    expect(await commentCount()).toBe(before + 1);

    // Anheften am Projekt
    await owner.goto(`/u/mattia.holz/${project.slug}`);
    const item = owner.locator("li", { hasText: `Das ist sperrwort${tag} e2e${tag}` }).first();
    await item.getByRole("button", { name: "Anheften" }).click();
    await expect(owner.getByText("Angeheftet von Mattia Rossi").first()).toBeVisible();
    const list = await comments(lena);
    expect(list[0]).toMatchObject({ id, pinned: true });
  });

  test("Kommentare schliessen: niemand kann mehr kommentieren", async ({ browser }) => {
    const owner = await loginAs(browser, "mattia");
    const elias = await loginAs(browser, "elias");
    await owner.goto(`/u/mattia.holz/${project.slug}`);
    await owner.getByRole("button", { name: "Kommentare schliessen" }).click();
    await expect(owner.getByText("Kommentare sind geschlossen – niemand kann mehr kommentieren.")).toBeVisible();

    const r = await elias.request.post("/api/v1/app/comments", { data: { type: "PROJECT", id: project.id, body: `Noch einer e2e${tag}` } });
    expect(r.status()).toBe(403);
    await elias.goto(`/u/mattia.holz/${project.slug}`);
    await expect(elias.getByText("Die Kommentare sind geschlossen.")).toBeVisible();

    await owner.getByRole("button", { name: "Kommentare öffnen" }).click();
    await expect(owner.getByText("Kommentare wieder offen.")).toBeVisible();
  });

  test("Profil-Design: Farbe, ohne Titelbild, Shop zuerst – nur mit Pro", async ({ browser }) => {
    const owner = await loginAs(browser, "mattia");
    const r = await owner.request.put("/api/v1/app/me/profile-theme", { data: { theme: { accent: "tinte", coverLayout: "none", sections: ["shop", "projects", "posts"] } } });
    expect(r.status(), await r.text()).toBe(200);

    const guest = await browser.newPage();
    await guest.goto("/u/mattia.holz");
    const style = await guest.locator("main div[style*='--color-moss']").first().getAttribute("style");
    expect(style).toContain("#2f5d84");
    const tabs = guest.getByRole("navigation", { name: "Profilbereiche" }).getByRole("link");
    await expect(tabs.first()).toHaveText(/Shop/);
    await expect(tabs.first()).toHaveAttribute("aria-current", "page");
    const app = await (await guest.request.get("/api/v1/app/users/mattia.holz")).json();
    expect((app.data ?? app).theme).toMatchObject({ accent: "tinte", coverLayout: "none" });

    // Ohne Pro gilt wieder der Standard (gespeichert bleibt es)
    if (!hadSub) {
      await sql(`UPDATE "Subscription" SET status = 'canceled' WHERE id = $1`, [`e2e_sub_${tag}`]);
      await guest.reload();
      expect(await guest.locator("main div[style*='--color-moss']").count()).toBe(0);
      await sql(`UPDATE "Subscription" SET status = 'active' WHERE id = $1`, [`e2e_sub_${tag}`]);
    }
    await guest.close();
  });
});
