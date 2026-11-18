import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontoübernahme über den Support verhindern: Wer die Adresse auf ein eigenes Postfach setzt, erhält den
 * Bestätigungslink selbst. Deshalb ändert nur die Superadministration fremde E-Mail-Adressen.
 */
const m = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db, Prisma: {} }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));

const { changeUserEmail } = await import("../users");
const input = { email: "neu@werkuno.test", reason: "Ticket #4711, Identität geprüft" };

beforeEach(() => vi.clearAllMocks());

describe("changeUserEmail", () => {
  it("Administration ohne Superadmin-Rolle: abgelehnt – auch ohne „direkt bestätigen“", async () => {
    await expect(changeUserEmail({ id: "a1", role: "ADMIN" } as never, "u1", input)).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/nur die Superadministration/) });
    await expect(changeUserEmail({ id: "a1", role: "ADMIN" } as never, "u1", { ...input, markVerified: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.db.user.findUnique).not.toHaveBeenCalled();
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("Moderation: weiterhin „nur die Administration“", async () => {
    await expect(changeUserEmail({ id: "a1", role: "PLATFORM_MODERATOR" } as never, "u1", input)).rejects.toMatchObject({ message: expect.stringMatching(/nur die Administration/) });
  });

  it("Superadministration kommt bis zur Prüfung des Kontos", async () => {
    m.db.user.findUnique.mockResolvedValueOnce(null);
    await expect(changeUserEmail({ id: "s1", role: "SUPERADMIN" } as never, "u1", input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
