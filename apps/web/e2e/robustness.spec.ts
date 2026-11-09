import { expect, test } from "@playwright/test";
import { one, runServer, sql, userId } from "./helpers";

/**
 * Robustheit (Paket A): E-Mail-Warteschlange, Kartenablehnung im Checkout, verlorener Streitfall,
 * Erstattungen stornierter Bestellungen, Kontolöschung. Serverfunktionen direkt, Daten per SQL.
 */
test.describe.serial("Robustheit", () => {
  test("E-Mail: Digest-Einträge verstopfen den Sofortversand nicht", async () => {
    const elias = await userId("elias");
    const mattia = await userId("mattia");
    await sql(`UPDATE "Notification" SET "emailedAt" = now() WHERE "emailedAt" IS NULL`);
    await sql(`UPDATE "User" SET "emailVerifiedAt" = coalesce("emailVerifiedAt", now()) WHERE id IN ($1, $2)`, [elias, mattia]);
    await sql(`DELETE FROM "UserPreference" WHERE "userId" = $1`, [elias]); // ohne Einstellung = täglicher Digest
    // 1200 ältere Like-Benachrichtigungen (Digest) + eine neue Bestellung (immer sofort)
    await sql(
      `INSERT INTO "Notification" (id, "recipientId", type, data, "createdAt", "updatedAt")
       SELECT 'e2e_mail_' || g, $1, 'LIKE', '{"message":"E2E mail"}', now() - interval '3 hours' + g * interval '1 millisecond', now() FROM generate_series(1, 1200) g`,
      [elias],
    );
    await sql(`INSERT INTO "Notification" (id, "recipientId", type, data, "createdAt", "updatedAt") VALUES ('e2e_mail_order', $1, 'ORDER_NEW', '{"message":"E2E mail"}', now() - interval '5 minutes', now())`, [mattia]);
    try {
      runServer(`import("./src/server/notifications-mail").then((m) => m.sendEmails("instant"))`);
      expect((await one<{ e: boolean }>(`SELECT "emailedAt" IS NOT NULL e FROM "Notification" WHERE id = 'e2e_mail_order'`))!.e).toBe(true);
      expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "Notification" WHERE id LIKE 'e2e_mail_%' AND type = 'LIKE' AND "emailedAt" IS NULL`))!.n).toBe(1200);
      runServer(`import("./src/server/notifications-mail").then((m) => m.sendEmails("digest"))`);
      expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "Notification" WHERE id LIKE 'e2e_mail_%' AND "emailedAt" IS NULL`))!.n).toBe(0);
    } finally {
      await sql(`DELETE FROM "Notification" WHERE id LIKE 'e2e_mail_%'`);
    }
  });

  /** Eine bezahlte Bestellung vorübergehend in einen Prüfzustand versetzen und danach zurücksetzen. */
  async function withOrder(fn: (o: { id: string; paymentId: string; amount: number }) => Promise<void>) {
    const o = (await one<{ id: string; status: string; checkoutSessionId: string | null; paymentId: string; amount: number; provider: string; providerRef: string | null; pstatus: string }>(
      `SELECT o.id, o.status, o."checkoutSessionId", p.id "paymentId", p."amountMinor" amount, p.provider, p."providerRef", p.status pstatus
       FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id
       WHERE p.status = 'SUCCEEDED' AND NOT EXISTS (SELECT 1 FROM "Refund" r WHERE r."orderId" = o.id) AND NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o.id AND i."isDigital")
       ORDER BY o."createdAt" DESC LIMIT 1`,
    ))!;
    const events = (await one<{ n: number }>(`SELECT count(*)::int n FROM "OrderEvent" WHERE "orderId" = $1`, [o.id]))!.n;
    try {
      await fn({ id: o.id, paymentId: o.paymentId, amount: o.amount });
    } finally {
      await sql(`DELETE FROM "Refund" WHERE "orderId" = $1`, [o.id]);
      await sql(`DELETE FROM "OrderEvent" WHERE id IN (SELECT id FROM "OrderEvent" WHERE "orderId" = $1 ORDER BY "createdAt" DESC LIMIT greatest(0, (SELECT count(*) FROM "OrderEvent" WHERE "orderId" = $1) - $2))`, [o.id, events]);
      await sql(`UPDATE "Payment" SET provider = $2, "providerRef" = $3, status = $4::"PaymentStatus", "failureReason" = NULL WHERE id = $1`, [o.paymentId, o.provider, o.providerRef, o.pstatus]);
      await sql(`UPDATE "Order" SET status = $2::"OrderStatus", "checkoutSessionId" = $3 WHERE id = $1`, [o.id, o.status, o.checkoutSessionId]);
    }
  }

  test("Checkout: abgelehnte Karte storniert die Bestellung nicht (neuer Versuch möglich)", async () => {
    await withOrder(async (o) => {
      await sql(`UPDATE "Order" SET status = 'PENDING_PAYMENT', "checkoutSessionId" = 'cs_e2e' WHERE id = $1`, [o.id]);
      await sql(`UPDATE "Payment" SET status = 'REQUIRES_PAYMENT' WHERE id = $1`, [o.paymentId]);
      runServer(
        `import("./src/server/commerce/payments").then((m) => m.handleStripeEvent({ id: "evt_e2e", type: "payment_intent.payment_failed", data: { object: { id: "pi_e2e", metadata: { orderId: "${o.id}" }, last_payment_error: { message: "Karte abgelehnt" } } } } as never))`,
      );
      const r = (await one<{ status: string; ps: string; reason: string }>(`SELECT o.status, p.status ps, p."failureReason" reason FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id WHERE o.id = $1`, [o.id]))!;
      expect(r).toEqual({ status: "PENDING_PAYMENT", ps: "REQUIRES_PAYMENT", reason: "Karte abgelehnt" });
    });
  });

  test("Streitfall verloren: als Rückbuchung verbucht, Bestellung erstattet", async () => {
    await withOrder(async (o) => {
      await sql(`UPDATE "Payment" SET provider = 'stripe', "providerRef" = 'pi_e2e_dispute', status = 'DISPUTED' WHERE id = $1`, [o.paymentId]);
      await sql(`UPDATE "Order" SET status = 'PROBLEM' WHERE id = $1`, [o.id]);
      runServer(`import("./src/server/commerce/payments").then((m) => m.markDisputeClosed("pi_e2e_dispute", { disputeId: "dp_e2e", status: "lost", amountMinor: ${o.amount} }))`);
      const r = (await one<{ status: string; ps: string; refunded: number }>(
        `SELECT o.status, p.status ps, (SELECT coalesce(sum("amountMinor"), 0)::int FROM "Refund" WHERE "orderId" = o.id AND status = 'SUCCEEDED') refunded FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id WHERE o.id = $1`,
        [o.id],
      ))!;
      expect(r).toEqual({ status: "REFUNDED", ps: "REFUNDED", refunded: o.amount });
    });
  });

  test("Stornierte Bestellung mit einbehaltenem Geld: Erstattung wird automatisch erneut ausgelöst", async () => {
    await withOrder(async (o) => {
      await sql(`UPDATE "Payment" SET provider = 'stripe', "providerRef" = 'pi_e2e_retry' WHERE id = $1`, [o.paymentId]);
      await sql(`UPDATE "Order" SET status = 'CANCELLED', "updatedAt" = now() WHERE id = $1`, [o.id]);
      // Ohne Stripe-Schlüssel schlägt der Versuch fehl → wird als FAILED festgehalten und später wiederholt
      runServer(`import("./src/server/commerce/payments").then((m) => m.retryCancelledRefunds())`);
      const rows = await sql<{ status: string; amountMinor: number }>(`SELECT status, "amountMinor" FROM "Refund" WHERE "orderId" = $1`, [o.id]);
      expect(rows).toEqual([{ status: "FAILED", amountMinor: o.amount }]);
      // Sofort danach: Wartezeit von 10 Minuten zwischen Versuchen
      runServer(`import("./src/server/commerce/payments").then((m) => m.retryCancelledRefunds())`);
      expect((await sql(`SELECT 1 FROM "Refund" WHERE "orderId" = $1`, [o.id])).length).toBe(1);
    });
  });

  test("Kontolöschung: Abo beendet, persönliche Daten entfernt; offene Shop-Bestellungen verhindern die Löschung", async () => {
    const email = `e2e-loeschen-${Date.now()}@demo.werkraum.local`;
    const id = runServer(`import("./src/server/db").then(async ({ db }) => {
      const { hashPassword } = await import("./src/server/crypto");
      const u = await db.user.create({ data: { email: "${email}", passwordHash: await hashPassword("Loeschen-2026!"), emailVerifiedAt: new Date(), profile: { create: { handle: "e2e-loeschen-${Date.now() % 100000}", displayName: "E2E Löschen" } } } });
      await db.subscription.create({ data: { userId: u.id, provider: "simulated", status: "active", interval: "month", currentPeriodEnd: new Date(Date.now() + 20 * 86400000) } });
      await db.customerDetails.create({ data: { userId: u.id, firstName: "E", lastName: "Zwo", line1: "Weg 1", postalCode: "8000", city: "Zürich", country: "CH" } });
      await db.shoppingList.create({ data: { ownerId: u.id, title: "E2E", items: { create: [{ name: "Schrauben", position: 0 }] } } });
      await db.materialStock.create({ data: { userId: u.id, name: "Restholz" } });
      await db.pushDevice.create({ data: { userId: u.id, token: "https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}", platform: "WEB", p256dh: "x".repeat(20), auth: "y".repeat(10) } });
      process.stdout.write("ID=" + u.id);
    })`).match(/ID=(\S+)/)![1]!;

    runServer(`import("./src/server/identity/service").then((m) => m.deleteAccount("${id}", "Loeschen-2026!"))`);
    const ev = await one<{ id: string }>(`SELECT id FROM "OutboxEvent" WHERE type = 'UserDeleted' AND payload->>'userId' = $1`, [id]);
    expect(ev).toBeTruthy();
    // Worker-Teil direkt ausführen
    runServer(`import("./src/server/account/deletion").then((m) => m.purgeDeletedAccount("${id}"))`);
    const left = (await one<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM "CustomerDetails" WHERE "userId" = $1) details, (SELECT count(*)::int FROM "ShoppingList" WHERE "ownerId" = $1) lists,
              (SELECT count(*)::int FROM "MaterialStock" WHERE "userId" = $1) stock, (SELECT count(*)::int FROM "PushDevice" WHERE "userId" = $1) devices,
              (SELECT count(*)::int FROM "Subscription" WHERE "userId" = $1 AND status <> 'canceled') subs`,
      [id],
    ))!;
    expect(left).toEqual({ details: 0, lists: 0, stock: 0, devices: 0, subs: 0 });
    await sql(`UPDATE "OutboxEvent" SET "publishedAt" = now() WHERE id = $1`, [ev!.id]);

    // Shop mit offener Bestellung: Löschen wird abgelehnt
    const lena = await userId("lena");
    const open = await one<{ id: string; status: string }>(`SELECT o.id, o.status FROM "Order" o JOIN "Shop" s ON s.id = o."shopId" WHERE s."ownerId" = $1 ORDER BY o."createdAt" DESC LIMIT 1`, [lena]);
    test.skip(!open, "Keine Bestellung bei Lena");
    await sql(`UPDATE "Order" SET status = 'NEW' WHERE id = $1`, [open!.id]);
    try {
      expect(() => runServer(`import("./src/server/account/deletion").then((m) => m.assertAccountDeletable("${lena}"))`)).toThrow(/offene Bestellung/);
    } finally {
      await sql(`UPDATE "Order" SET status = $2::"OrderStatus" WHERE id = $1`, [open!.id, open!.status]);
    }
  });
});
