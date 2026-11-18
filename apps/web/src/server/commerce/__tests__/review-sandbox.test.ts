import { describe, expect, it, vi } from "vitest";

/** Bewertungen: Testkäufe aus der App (Apple Sandbox/Xcode) zählen nicht als Kauf. */
const m = vi.hoisted(() => ({ db: { orderItem: { findUnique: vi.fn() }, $transaction: vi.fn() } }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));

const { createReview } = await import("../reviews");
const item = (environment: string | null) => ({
  id: "i1",
  productId: "p1",
  review: null,
  order: { id: "o1", buyerId: "u1", status: "COMPLETED", shopId: "sh1", payments: [{ status: "SUCCEEDED" }], appStorePurchase: environment ? { environment } : null },
});

describe("createReview", () => {
  it("Sandbox-Kauf: keine Bewertung", async () => {
    m.db.orderItem.findUnique.mockResolvedValue(item("Sandbox"));
    await expect(createReview({ id: "u1" } as never, { orderItemId: "i1", productRating: 5, body: "Sehr schöne Anleitung, klar erklärt." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });
});
