import { beforeEach, describe, expect, it, vi } from "vitest";

/** Kontolöschung: Dateien verkaufter digitaler Produkte bleiben, damit Käufer:innen weiter herunterladen können. */
const m = vi.hoisted(() => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const model = (name: string) =>
    new Proxy({}, { get: (_t, op: string) => (calls[`${name}.${op}`] ??= vi.fn(async () => (op === "findMany" ? [] : op === "findUnique" ? null : { count: 0 }))) });
  const db = new Proxy({}, { get: (_t, name: string) => model(name) });
  return { calls, db };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/storage", () => ({ storage: () => ({ del: vi.fn(async () => {}) }) }));
vi.mock("@/server/pro/service", () => ({ endProForDeletedAccount: vi.fn() }));
vi.mock("@/server/commerce/payments", () => ({ markPaymentFailed: vi.fn() }));
vi.mock("@/server/commerce/stripe", () => ({ paymentsMode: () => "simulated" }));
vi.mock("@/server/identity/apple-token", () => ({ revokeAppleTokensForUser: vi.fn(async () => {}) }));

const { purgeDeletedAccount } = await import("../deletion");
const fn = (k: string) => (m.db as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[k.split(".")[0]!]![k.split(".")[1]!]!;

beforeEach(() => {
  fn("user.findUnique").mockResolvedValue({ status: "DELETED", shop: null });
  fn("product.findMany").mockResolvedValue([{ digitalKey: "file1" }]);
  fn("media.findMany").mockResolvedValue([]);
});

describe("purgeDeletedAccount", () => {
  it("nimmt digitale Dateien verkaufter Produkte von der Medienlöschung aus", async () => {
    await purgeDeletedAccount("u1");
    expect(fn("product.findMany")).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ shop: { ownerId: "u1" }, digitalKey: { not: null } }) }));
    expect(fn("media.findMany")).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "u1", productMedia: { none: {} }, id: { notIn: ["file1"] } } }));
  });
});
