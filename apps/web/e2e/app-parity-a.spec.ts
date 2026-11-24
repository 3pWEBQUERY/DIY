import { createHash, randomBytes } from "node:crypto";
import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { currentStep, hotp } from "../src/server/auth/totp";
import { PASSWORD, loginAs, one, sql } from "./helpers";

/**
 * App-Schnittstelle für iOS-Parität A: Zwei-Faktor-Verwaltung, Passwort-Link in der App,
 * Studio-Geschenkgutscheine, Antwort auf Bewertungen, geteilter Gutschein, Gäste-Währung.
 */

const API = "/api/v1/app";

async function appContext(baseURL: string | undefined, token?: string, headers: Record<string, string> = {}) {
  return pwRequest.newContext({ baseURL, extraHTTPHeaders: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
}

const data = async (r: Awaited<ReturnType<APIRequestContext["get"]>>) => (await r.json()).data;

test.describe.serial("Zwei-Faktor und Passwort-Link über die App", () => {
  let token = "";
  let userId = "";
  let secret = "";
  const stamp = Date.now().toString(36);
  const email = `e2e-2fa-${stamp}@demo.werkraum.local`;

  test.afterAll(async () => {
    if (userId) await sql(`DELETE FROM "User" WHERE id = $1`, [userId]).catch(() => {});
  });

  test("Konto anlegen (App-Token)", async ({ baseURL }) => {
    const anon = await appContext(baseURL);
    const r = await anon.post(`${API}/auth/signup`, {
      data: { email, password: PASSWORD, displayName: "E2E Zweifaktor", handle: `e2e2fa${stamp}`.slice(0, 20), country: "CH", adult: true, terms: true },
    });
    expect(r.status(), await r.text()).toBe(200);
    const d = await data(r);
    token = d.token;
    userId = d.userId;
    expect(token).toBeTruthy();
  });

  test("Einrichten, bestätigen, Codes erneuern, deaktivieren", async ({ baseURL }) => {
    const app = await appContext(baseURL, token);
    const status = await data(await app.get(`${API}/settings/mfa`));
    expect(status).toMatchObject({ enabled: false, hasPassword: true, required: false });

    // Ohne Passwort: erneute Anmeldung nötig
    const noPw = await app.post(`${API}/settings/mfa/setup`, { data: {} });
    expect(noPw.ok()).toBe(false);

    const setup = await app.post(`${API}/settings/mfa/setup`, { data: { password: PASSWORD } });
    expect(setup.status(), await setup.text()).toBe(200);
    const s = await data(setup);
    expect(s.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(s.qrSvg).toContain("<svg");
    secret = String(s.secret).replace(/\s/g, "");

    // Falscher Code → Feldfehler
    const wrong = await app.post(`${API}/settings/mfa/confirm`, { data: { code: "000000" === hotp(secret, currentStep()) ? "111111" : "000000" } });
    expect(wrong.status()).toBe(422);
    expect((await wrong.json()).error.fields.code).toBeTruthy();

    // Bestätigen (ein Schritt zurück, damit die nächsten Codes neuer sind)
    const c0 = currentStep();
    const confirm = await app.post(`${API}/settings/mfa/confirm`, { data: { code: hotp(secret, c0 - 1) } });
    expect(confirm.status(), await confirm.text()).toBe(200);
    const codes = (await data(confirm)).recoveryCodes as string[];
    expect(codes.length).toBeGreaterThanOrEqual(8);
    expect(await data(await app.get(`${API}/settings/mfa`))).toMatchObject({ enabled: true, recoveryCodesLeft: codes.length });

    // Neue Wiederherstellungscodes: alter (schon benutzter) Code geht nicht, aktueller schon
    const replay = await app.post(`${API}/settings/mfa/recovery-codes`, { data: { code: hotp(secret, c0 - 1) } });
    expect(replay.status()).toBe(422);
    const c1 = currentStep();
    const regen = await app.post(`${API}/settings/mfa/recovery-codes`, { data: { code: hotp(secret, c1) } });
    expect(regen.status(), await regen.text()).toBe(200);
    const fresh = (await data(regen)).recoveryCodes as string[];
    expect(fresh).not.toEqual(codes);

    // Deaktivieren braucht Passwort UND Code
    const noProof = await app.post(`${API}/settings/mfa/disable`, { data: { code: hotp(secret, c1 + 1) } });
    expect(noProof.ok()).toBe(false);
    const off = await app.post(`${API}/settings/mfa/disable`, { data: { code: hotp(secret, c1 + 1), password: PASSWORD } });
    expect(off.status(), await off.text()).toBe(200);
    expect(await data(await app.get(`${API}/settings/mfa`))).toMatchObject({ enabled: false });
    expect(await one(`SELECT count(*)::int n FROM "MfaRecoveryCode" WHERE "userId" = $1`, [userId])).toMatchObject({ n: 0 });
  });

  test("Neues Passwort über den Link aus der E-Mail (App)", async ({ baseURL }) => {
    const raw = randomBytes(24).toString("base64url");
    await sql(`INSERT INTO "VerificationToken" (id, "userId", purpose, "expiresAt") VALUES ($1, $2, 'PASSWORD_RESET', now() + interval '1 hour')`, [
      createHash("sha256").update(raw).digest("hex"),
      userId,
    ]);
    const anon = await appContext(baseURL);
    const weak = await anon.post(`${API}/auth/password-reset/confirm`, { data: { token: raw, password: "kurz" } });
    expect(weak.status()).toBe(422);
    const ok = await anon.post(`${API}/auth/password-reset/confirm`, { data: { token: raw, password: "Neues-Passwort-2026" } });
    expect(ok.status(), await ok.text()).toBe(200);
    // Alle Sitzungen beendet (auch das App-Token), kein neues Cookie
    expect(ok.headers()["set-cookie"] ?? "").not.toContain("wr_session");
    const app = await appContext(baseURL, token);
    expect((await app.get(`${API}/settings/mfa`)).status()).toBe(401);
    // Einmal-Link
    const again = await anon.post(`${API}/auth/password-reset/confirm`, { data: { token: raw, password: "Noch-ein-Passwort-1" } });
    expect(again.status()).toBe(422);
  });
});

test("Studio-Geschenkgutscheine über die App", async ({ browser }) => {
  const lena = await loginAs(browser, "lena");
  const before = await lena.request.get(`${API}/studio/giftcards`);
  expect(before.status(), await before.text()).toBe(200);
  const page = await data(before);
  expect(page.shop.currency).toBeTruthy();
  expect(page.stats).toMatchObject({ sold: expect.any(Number), openMinor: expect.any(Number) });
  // Codes nur maskiert
  for (const c of page.cards as { code: string }[]) expect(c.code).not.toMatch(/^[0-9A-Z]{16}$/);
  const original = page.settings;

  const bad = await lena.request.put(`${API}/studio/giftcards/settings`, { data: { ...original, enabled: true, amounts: [], customEnabled: false } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.fields.amounts).toBeTruthy();
  const badMonths = await lena.request.put(`${API}/studio/giftcards/settings`, { data: { ...original, validityMonths: 6 } });
  expect(badMonths.status()).toBe(422);

  const save = await lena.request.put(`${API}/studio/giftcards/settings`, {
    data: { enabled: true, amounts: [2500, 5000], customEnabled: true, customMinMinor: 1000, customMaxMinor: 20000, validityMonths: 24, note: "E2E Hinweis" },
  });
  expect(save.status(), await save.text()).toBe(200);
  expect((await data(await lena.request.get(`${API}/studio/giftcards`))).settings).toMatchObject({ enabled: true, amounts: [2500, 5000], validityMonths: 24, note: "E2E Hinweis" });

  const missing = await lena.request.post(`${API}/studio/giftcards/cmxxxxxxxxxxxxxxxxxxxxxxx/refund`);
  expect(missing.status()).toBe(404);

  // Zurück auf den vorherigen Stand
  const restore = await lena.request.put(`${API}/studio/giftcards/settings`, { data: original });
  expect(restore.status(), await restore.text()).toBe(200);

  const elias = await loginAs(browser, "elias");
  expect((await elias.request.get(`${API}/studio/giftcards`)).ok()).toBe(false);
});

test("Antwort auf eine Bewertung über die App", async ({ browser }) => {
  const item = await one<{ orderId: string; itemId: string; productId: string; buyerId: string }>(
    `SELECT o.id "orderId", oi.id "itemId", oi."productId", o."buyerId" FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" JOIN "Shop" s ON s.id = o."shopId"
      WHERE s.slug = 'lenas-maschen' AND NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."orderItemId" = oi.id) LIMIT 1`,
  );
  test.skip(!item, "Keine Bestellung im Shop, an der eine Bewertung hängen kann");
  const reviewId = `e2ereview${Date.now().toString(36)}`;
  await sql(`INSERT INTO "Review" (id, "orderId", "orderItemId", "productId", "authorId", "productRating", body, state, "updatedAt") VALUES ($1, $2, $3, $4, $5, 5, 'E2E: schön gemacht', 'PUBLISHED', now())`, [
    reviewId,
    item!.orderId,
    item!.itemId,
    item!.productId,
    item!.buyerId,
  ]);
  try {
    const lena = await loginAs(browser, "lena");
    const list = await data(await lena.request.get(`${API}/users/lena.haekelt/reviews`));
    expect(list).toMatchObject({ view: "received", canReply: true });

    const tooLong = await lena.request.put(`${API}/reviews/${reviewId}/reply`, { data: { reply: "x".repeat(1001) } });
    expect(tooLong.status()).toBe(422);
    const saved = await lena.request.put(`${API}/reviews/${reviewId}/reply`, { data: { reply: "Danke für das Feedback!" } });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(await data(saved)).toMatchObject({ reply: "Danke für das Feedback!", message: "Antwort gespeichert." });
    expect(await one(`SELECT "sellerReply" FROM "Review" WHERE id = $1`, [reviewId])).toMatchObject({ sellerReply: "Danke für das Feedback!" });
    const removed = await lena.request.put(`${API}/reviews/${reviewId}/reply`, { data: { reply: "" } });
    expect((await data(removed)).message).toBe("Antwort entfernt.");

    const elias = await loginAs(browser, "elias");
    expect((await data(await elias.request.get(`${API}/users/lena.haekelt/reviews`))).canReply).toBe(false);
    expect((await elias.request.put(`${API}/reviews/${reviewId}/reply`, { data: { reply: "Fremd" } })).status()).toBe(403);
  } finally {
    await sql(`DELETE FROM "Review" WHERE id = $1`, [reviewId]);
  }
});

test("Geteilter Gutschein (App) und Gäste-Währung per Header", async ({ browser, baseURL }) => {
  const lena = await loginAs(browser, "lena");
  const code = `APPLINK${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = await lena.request.post(`${API}/studio/coupons`, { data: { code, kind: "PERCENT", value: 15, active: true } });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await data(created)).id as string;
  try {
    const guest = await appContext(baseURL);
    const c = await data(await guest.get(`${API}/market/coupons/${id}`));
    expect(c).toMatchObject({ id, code, valid: true, headline: "15 % Rabatt", shop: { slug: "lenas-maschen" } });
    expect((await guest.get(`${API}/market/coupons/unbekannt`)).status()).toBe(404);
  } finally {
    await lena.request.delete(`${API}/studio/coupons/${id}`);
  }

  // Gäste ohne Konto: X-Werkuno-Currency bestimmt die Währung (nur CHF/EUR)
  const eur = await appContext(baseURL, undefined, { "X-Werkuno-Currency": "EUR", "Accept-Language": "de-CH" });
  expect((await data(await eur.get(`${API}/bootstrap`))).price.currency).toBe("EUR");
  const chf = await appContext(baseURL, undefined, { "X-Werkuno-Currency": "chf", "Accept-Language": "de-DE" });
  expect((await data(await chf.get(`${API}/bootstrap`))).price.currency).toBe("CHF");
  const junk = await appContext(baseURL, undefined, { "X-Werkuno-Currency": "USD", "Accept-Language": "de-CH" });
  expect((await data(await junk.get(`${API}/bootstrap`))).price.currency).toBe("CHF");
  // Angemeldet mit Land (Lena: CH) zählt das Konto, nicht der Header
  const lenaToken = (await lena.context().cookies()).find((k) => k.name === "wr_session")?.value;
  const signedIn = await appContext(baseURL, lenaToken, { "X-Werkuno-Currency": "EUR" });
  expect((await data(await signedIn.get(`${API}/bootstrap`))).price.currency).toBe("CHF");
});
