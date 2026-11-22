import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractCardRefs, newsletterInputSchema, rate, safeClickTarget, stripCardRefs } from "@/lib/newsletter";

const db = {
  creatorNewsletter: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  newsletterDelivery: { updateMany: vi.fn(), findUnique: vi.fn() },
  $queryRaw: vi.fn(),
};
let pro = true;
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(f: T) => f }));
vi.mock("@/server/db", () => ({ db, Prisma: { sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }) } }));
vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "x".repeat(40), APP_URL: "https://werkuno.ch" }), features: { email: () => false } }));
vi.mock("@/server/pro/service", () => ({ isPro: async () => pro, PRO_NAME: "Creator Pro" }));
vi.mock("@/server/settings", () => ({ getSetting: async () => 4 }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => ({ delivered: false })) }));
vi.mock("@/server/commerce/restock", () => ({ publicProductWhere: {} }));

const nl = await import("../newsletter");

describe("Newsletter-Inhalt", () => {
  it("liest bis zu drei Karten aus dem Text und entfernt sie für den Fliesstext", () => {
    const body = "Hallo\n\n[[projekt:abcdefgh1]]\n[[anleitung:abcdefgh2]]\n[[projekt:abcdefgh1]]\n[[produkt:abcdefgh3]]\n[[produkt:abcdefgh4]]";
    expect(extractCardRefs(body)).toEqual([
      { kind: "projekt", id: "abcdefgh1" },
      { kind: "anleitung", id: "abcdefgh2" },
      { kind: "produkt", id: "abcdefgh3" },
    ]);
    expect(stripCardRefs(body)).toBe("Hallo");
  });

  it("prüft Betreff und Text", () => {
    expect(newsletterInputSchema.safeParse({ subject: "Hi", body: "x".repeat(30) }).success).toBe(false);
    expect(newsletterInputSchema.safeParse({ subject: "Neu im Atelier", body: "zu kurz" }).success).toBe(false);
    expect(newsletterInputSchema.safeParse({ subject: "Neu im Atelier", body: "Diese Woche ist ein neuer Hocker entstanden." }).success).toBe(true);
  });

  it("leitet Klicks nur auf http(s) weiter", () => {
    expect(safeClickTarget("/u/lena", "https://werkuno.ch")).toBe("https://werkuno.ch/u/lena");
    expect(safeClickTarget("https://example.com/x", "https://werkuno.ch")).toBe("https://example.com/x");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "", null]) expect(safeClickTarget(bad, "https://werkuno.ch")).toBeNull();
  });

  it("berechnet Raten ohne Division durch null", () => {
    expect(rate(3, 10)).toBe(30);
    expect(rate(12, 10)).toBe(100);
    expect(rate(0, 0)).toBeNull();
  });
});

describe("Tokens", () => {
  it("Zustellung: gültig nur unverändert", () => {
    const t = nl.deliveryToken("nld_123");
    expect(nl.verifyDeliveryToken(t)).toBe("nld_123");
    expect(nl.verifyDeliveryToken(`nld_124.${t.split(".")[1]}`)).toBeNull();
    for (const bad of [null, "", "abc", "x.", ".y", "x".repeat(200)]) expect(nl.verifyDeliveryToken(bad)).toBeNull();
  });

  it("Abmelden: gilt nur für genau diese Person und Creatorin", () => {
    const t = nl.unsubscribeToken("user-a", "creator-b");
    expect(nl.verifyUnsubscribeToken(t)).toEqual({ userId: "user-a", creatorId: "creator-b" });
    const sig = t.split(".")[2];
    expect(nl.verifyUnsubscribeToken(`user-x.creator-b.${sig}`)).toBeNull();
    expect(nl.verifyUnsubscribeToken(`user-a.creator-x.${sig}`)).toBeNull();
    // Zustell-Token ist kein Abmelde-Token
    expect(nl.verifyUnsubscribeToken(nl.deliveryToken("user-a"))).toBeNull();
  });
});

describe("Senden und Planen", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const draft = { id: "n1", authorId: "u1", status: "DRAFT", subject: "Neu im Atelier", body: "Diese Woche ist ein neuer Hocker entstanden." };
  beforeEach(() => {
    pro = true;
    vi.clearAllMocks();
    db.creatorNewsletter.findUnique.mockResolvedValue(draft);
    db.creatorNewsletter.count.mockResolvedValue(0);
    db.$queryRaw.mockResolvedValue([{ n: 5n }]);
  });

  it("sendet sofort oder plant – an alle aktuellen Empfänger:innen", async () => {
    const r = await nl.scheduleNewsletter({ id: "u1" }, "n1", {}, now);
    expect(r).toMatchObject({ recipients: 5, immediate: true, scheduledAt: now.toISOString() });
    expect(db.creatorNewsletter.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { status: "SCHEDULED", scheduledAt: now } });
    const at = new Date(now.getTime() + 86_400_000);
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", { at: at.toISOString() }, now)).resolves.toMatchObject({ immediate: false });
  });

  it("begrenzt auf vier Ausgaben in 30 Tagen", async () => {
    db.creatorNewsletter.count.mockResolvedValue(4);
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", {}, now)).rejects.toThrow(/höchstens 4 Newsletter/);
    expect(db.creatorNewsletter.update).not.toHaveBeenCalled();
  });

  it("lehnt Vergangenheit, zu weit Geplantes, leere Liste, Fremde und Nicht-Pro ab", async () => {
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", { at: "2026-11-19T10:00:00Z" }, now)).rejects.toThrow(/Vergangenheit/);
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", { at: "2027-03-01T10:00:00Z" }, now)).rejects.toThrow(/60 Tage/);
    db.$queryRaw.mockResolvedValue([{ n: 0n }]);
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", {}, now)).rejects.toThrow(/Noch niemand/);
    await expect(nl.scheduleNewsletter({ id: "other" }, "n1", {}, now)).rejects.toThrow(/nicht gefunden/);
    pro = false;
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", {}, now)).rejects.toThrow(/Creator Pro/);
  });

  it("verbietet Zahlungslinks im Text", async () => {
    db.creatorNewsletter.findUnique.mockResolvedValue({ ...draft, body: "Bezahl mir direkt per twint an 079 123 45 67 oder paypal.me/lena – dann schicke ich es dir." });
    await expect(nl.scheduleNewsletter({ id: "u1" }, "n1", {}, now)).rejects.toThrow(/Zahlung/);
  });
});

describe("Öffnungen und Klicks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zählt eine Öffnung nur einmal", async () => {
    const t = nl.deliveryToken("d1");
    db.newsletterDelivery.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.newsletterDelivery.findUnique.mockResolvedValue({ newsletterId: "n1" });
    expect(await nl.recordOpen(t)).toBe(true);
    expect(await nl.recordOpen(t)).toBe(true);
    expect(db.creatorNewsletter.update).toHaveBeenCalledTimes(1);
    expect(await nl.recordOpen("d1.falsch")).toBe(false);
  });

  it("Klick zählt auch als Öffnung, unsichere Ziele landen auf der Startseite", async () => {
    db.newsletterDelivery.findUnique.mockResolvedValue({ newsletterId: "n1", openedAt: null, clickedAt: null });
    db.newsletterDelivery.updateMany.mockResolvedValue({ count: 1 });
    expect(await nl.recordClick(nl.deliveryToken("d1"), "/u/lena")).toBe("https://werkuno.ch/u/lena");
    expect(db.creatorNewsletter.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { clickCount: { increment: 1 }, openCount: { increment: 1 } } });
    expect(await nl.recordClick(nl.deliveryToken("d1"), "javascript:alert(1)")).toBe("https://werkuno.ch/");
  });
});
