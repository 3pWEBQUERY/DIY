import { beforeEach, describe, expect, it, vi } from "vitest";

/** Benachrichtigungs-Mails: endgültige Ablehnung (4xx) nicht 48 Std. lang wiederholen. */
const m = vi.hoisted(() => ({
  db: { notification: { updateMany: vi.fn(), findMany: vi.fn() } },
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/mail", () => ({ sendMail: m.send }));
vi.mock("@/server/mail-unsubscribe", () => ({ unsubscribeUrl: () => "https://x/abmelden" }));
vi.mock("@/server/moderation/appeal-link", () => ({ appealToken: () => "t" }));
vi.mock("@/server/env", () => ({ features: { email: () => true } }));
vi.mock("@/server/monitoring", () => ({ captureError: vi.fn() }));
vi.mock("@/server/notifications-format", () => ({ notificationHref: () => "/benachrichtigungen", notificationText: () => "Neu" }));

const { isPermanentMailFailure, sendEmails } = await import("../notifications-mail");

const fresh = { id: "n1", recipientId: "u1", type: "ORDER_NEW", data: {}, createdAt: new Date(), recipient: { email: "a@b.ch" } };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.notification.updateMany.mockResolvedValue({ count: 0 });
  m.db.notification.findMany.mockResolvedValueOnce([fresh]).mockResolvedValue([]);
});

describe("isPermanentMailFailure", () => {
  it("4xx ist endgültig – ausser 401, 408 und 429", () => {
    expect([400, 403, 404, 422].map(isPermanentMailFailure)).toEqual([true, true, true, true]);
    expect([401, 408, 429, 500, 503, undefined].map(isPermanentMailFailure)).toEqual([false, false, false, false, false, false]);
  });
});

describe("sendEmails", () => {
  it("ungültige Adresse (422): sofort als erledigt markieren", async () => {
    m.send.mockResolvedValue({ delivered: false, failed: true, status: 422, reason: "invalid" });
    await sendEmails("instant");
    expect(m.db.notification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["n1"] } }, data: { emailedAt: expect.any(Date) } });
  });

  it("Rate-Limit (429): offen lassen, nächster Lauf versucht es erneut", async () => {
    m.send.mockResolvedValue({ delivered: false, failed: true, status: 429, reason: "rate" });
    await sendEmails("instant");
    expect(m.db.notification.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["n1"] } } }));
  });
});
