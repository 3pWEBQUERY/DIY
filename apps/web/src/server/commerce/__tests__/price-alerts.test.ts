import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {}, Prisma: { sql: () => "", empty: "" } }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/monitoring", () => ({ captureError: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/mail-unsubscribe", () => ({ unsubscribeUrl: () => "" }));
vi.mock("@/server/realtime/bus", () => ({ publish: vi.fn() }));
vi.mock("../currency", () => ({ getFxRate: async () => ({ rate: 0.94, date: null, fetchedAt: null }) }));
vi.mock("../sale-prices", () => ({ salesForProducts: async () => new Map(), saleUnit: (m: number) => m }));

const { isNotablePriceDrop, untilLabel } = await import("../price-alerts");
const { inReminderWindow, reminderAllowed } = await import("../cart-reminders");

describe("Preisalarm", () => {
  it("meldet nur echte Senkungen ab 5 %", () => {
    expect(isNotablePriceDrop(10_000, 9_500)).toBe(true);
    expect(isNotablePriceDrop(10_000, 9_600)).toBe(false);
    expect(isNotablePriceDrop(10_000, 10_000)).toBe(false);
    expect(isNotablePriceDrop(10_000, 12_000)).toBe(false);
  });

  it("nennt das Ende der Aktion verständlich", () => {
    const now = new Date("2026-11-23T10:00:00Z"); // Montag
    expect(untilLabel(new Date("2026-11-28T20:00:00Z"), now)).toBe("noch bis Samstag");
    expect(untilLabel(new Date("2026-12-15T20:00:00Z"), now)).toBe("noch bis 15. Dezember");
  });
});

describe("Warenkorb-Erinnerung", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it("erinnert nur 24–72 Stunden nach der letzten Änderung", () => {
    expect(inReminderWindow(hoursAgo(10), now)).toBe(false);
    expect(inReminderWindow(hoursAgo(24), now)).toBe(true);
    expect(inReminderWindow(hoursAgo(48), now)).toBe(true);
    expect(inReminderWindow(hoursAgo(73), now)).toBe(false);
  });

  it("respektiert Einstellung, Bestellungen, Verfügbarkeit und den Wochenabstand", () => {
    const base = { prefs: null, lastReminderAt: null, orderedSince: false, purchasableCount: 2 };
    expect(reminderAllowed(base, now)).toBe(true);
    expect(reminderAllowed({ ...base, prefs: { cartReminders: false } }, now)).toBe(false);
    expect(reminderAllowed({ ...base, prefs: { cartReminders: true } }, now)).toBe(true);
    expect(reminderAllowed({ ...base, orderedSince: true }, now)).toBe(false);
    expect(reminderAllowed({ ...base, purchasableCount: 0 }, now)).toBe(false);
    expect(reminderAllowed({ ...base, lastReminderAt: hoursAgo(5 * 24) }, now)).toBe(false);
    expect(reminderAllowed({ ...base, lastReminderAt: hoursAgo(8 * 24) }, now)).toBe(true);
  });
});
