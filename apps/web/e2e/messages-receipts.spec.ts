import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/** Direkte Unterhaltung Lena ↔ Mattia (angenommen, nicht archiviert) – vorhanden oder neu. */
async function directConversation() {
  const lena = await userId("lena");
  const mattia = await userId("mattia");
  const found = await one<{ id: string }>(
    `SELECT c.id FROM "Conversation" c
       JOIN "ConversationMember" a ON a."conversationId" = c.id AND a."userId" = $1
       JOIN "ConversationMember" b ON b."conversationId" = c.id AND b."userId" = $2
      WHERE c.kind = 'DIRECT' AND (SELECT count(*) FROM "ConversationMember" m WHERE m."conversationId" = c.id) = 2 LIMIT 1`,
    [lena, mattia],
  );
  const id = found?.id ?? `e2e_conv_${Date.now()}`;
  if (!found) {
    await sql(`INSERT INTO "Conversation" (id, kind, "lastMessageAt", "createdAt") VALUES ($1, 'DIRECT', now(), now())`, [id]);
    await sql(`INSERT INTO "ConversationMember" ("conversationId", "userId", "joinedAt") VALUES ($1, $2, now() - interval '1 day'), ($1, $3, now() - interval '1 day')`, [id, lena, mattia]);
  }
  await sql(`UPDATE "ConversationMember" SET "isRequest" = false, "archivedAt" = NULL WHERE "conversationId" = $1`, [id]);
  await sql(`UPDATE "UserPreference" SET "readReceipts" = true WHERE "userId" IN ($1, $2)`, [lena, mattia]);
  return { id, lena, mattia };
}

test("Lesebestätigungen: ✓ gesendet → ✓✓ zugestellt → ✓✓ gelesen", async ({ browser }) => {
  const { id, mattia } = await directConversation();
  const msgId = `e2e_msg_${Date.now()}`;
  const now = new Date();
  const before = new Date(now.getTime() - 3600_000);
  // Mattia hat noch nichts abgerufen (Zeitpunkte aus JS – unabhängig von der Zeitzone der Datenbank)
  await sql(`UPDATE "ConversationMember" SET "lastReadAt" = $3, "lastDeliveredAt" = $3 WHERE "conversationId" = $1 AND "userId" = $2`, [id, mattia, before]);
  await sql(`INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt") VALUES ($1, $2, $3, 'Häkchen-Test', $4)`, [msgId, id, await userId("lena"), now]);
  await sql(`UPDATE "Conversation" SET "lastMessageAt" = $2 WHERE id = $1`, [id, now]);

  const page = await loginAs(browser, "lena");
  await page.goto(`/nachrichten/${id}`);
  const bubble = page.locator("li", { hasText: "Häkchen-Test" }).last();
  // Offene Mattia-Sitzungen anderer Tests können sofort „zugestellt“ melden
  await expect(bubble.getByTitle(/^(Gesendet|Zugestellt)$/)).toBeVisible();

  // Mattia ruft seine Zähler ab (wie Web-Shell bzw. App) → zugestellt
  const m = await loginAs(browser, "mattia");
  await m.request.get("/api/v1/me/counts");
  await expect(bubble.getByTitle("Zugestellt")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`a[href="/nachrichten/${id}"]`).getByText("Zugestellt")).toBeVisible({ timeout: 15_000 });

  // Mattia öffnet die Unterhaltung → gelesen
  await m.goto(`/nachrichten/${id}`);
  await expect(m.getByText("Häkchen-Test").first()).toBeVisible();
  await expect(bubble.getByTitle("Gelesen")).toBeVisible({ timeout: 15_000 });

  // Ausgeschaltet (gegenseitig): wieder nur „zugestellt“
  await sql(`UPDATE "UserPreference" SET "readReceipts" = false WHERE "userId" = $1`, [mattia]);
  try {
    await page.reload();
    await expect(page.locator("li", { hasText: "Häkchen-Test" }).last().getByTitle("Zugestellt")).toBeVisible();
  } finally {
    await sql(`UPDATE "UserPreference" SET "readReceipts" = true WHERE "userId" = $1`, [mattia]);
    await sql(`DELETE FROM "Message" WHERE id = $1`, [msgId]);
  }
});

test("Pinterest ohne Konfiguration: kein Button, Start führt mit Hinweis zurück", async ({ browser, request }) => {
  // Ohne PINTEREST_CLIENT_ID: kein Button, Start führt mit Hinweis zur Anmeldung zurück
  const r = await request.get("/api/auth/pinterest", { maxRedirects: 0 });
  expect(r.status()).toBeGreaterThanOrEqual(300);
  expect(r.headers()["location"]).toContain("/anmelden?fehler=pinterest");
  const p = await browser.newPage();
  await p.goto("/anmelden?fehler=pinterest");
  await expect(p.getByText("Die Anmeldung mit Pinterest ist fehlgeschlagen")).toBeVisible();
  await expect(p.getByText("Mit Pinterest fortfahren")).toHaveCount(0);
  await p.goto("/registrieren/pinterest");
  await expect(p.getByText("abgelaufen oder wurde nicht gestartet")).toBeVisible();
});
