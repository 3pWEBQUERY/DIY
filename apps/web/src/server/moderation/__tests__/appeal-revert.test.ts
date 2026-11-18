import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Einspruch stattgegeben: Kontomassnahmen nur zurücknehmen, solange der Zustand noch von dieser Massnahme
 * stammt; Teammitglieder nur durch die Superadministration. Verbergen überschreibt nie „entfernt“.
 */
const h = vi.hoisted(() => ({
  calls: [] as { op: string; args: unknown }[],
  appeal: null as unknown,
  subjectRole: "MEMBER",
  postState: "PUBLISHED",
  laterShopDecision: false,
}));
vi.mock("@/server/audit", () => ({ audit: async () => ({}) }));
vi.mock("@/server/events", () => ({ emit: async () => ({}) }));
vi.mock("@/server/notifications", () => ({ notify: async () => null }));
vi.mock("@/server/social/targets", () => ({ bumpCounter: async () => {}, targetMeta: async () => null }));
vi.mock("@/server/social/counters", () => ({ syncPostCount: async () => {}, syncProjectCount: async () => {} }));

const rec = (op: string, count = 1) => async (args: unknown) => (h.calls.push({ op, args }), { count });
const tx = {
  appeal: { updateMany: async () => ({ count: 1 }) },
  user: { updateMany: rec("user.updateMany") },
  shop: { updateMany: rec("shop.updateMany") },
  auditEvent: { findFirst: async () => (h.laterShopDecision ? { id: "a" } : null) },
  moderationAction: { create: async ({ data }: { data: unknown }) => (h.calls.push({ op: "moderationAction.create", args: data }), { id: "act" }) },
  moderationCase: { update: async () => ({}), updateMany: async () => ({ count: 1 }) },
  post: {
    findUniqueOrThrow: async () => ({ state: h.postState, reachLimited: false, authorId: "u2" }),
    update: rec("post.update"),
  },
};
vi.mock("@/server/db", () => ({
  db: {
    appeal: { findUnique: async () => h.appeal },
    user: { count: async () => 1, findUnique: async () => ({ role: h.subjectRole }) },
    moderationCase: {
      findUnique: async () => ({ id: "c1", number: 1, status: "OPEN", targetType: "POST", targetId: "p1", subjectUserId: "u2", snapshot: {}, assigneeId: null, reports: [] }),
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { decideAppeal, decideCase } = await import("../service");

const MOD = { id: "m2", role: "PLATFORM_MODERATOR" as const };
const ADMIN = { id: "m3", role: "ADMIN" as const };
const SUPER = { id: "m4", role: "SUPERADMIN" as const };
const until = new Date("2026-12-01T00:00:00Z");
const at = new Date("2026-11-10T00:00:00Z");

function appealFor(action: string, prior: Record<string, unknown>, actionUntil: Date | null = until) {
  return {
    id: "ap1",
    status: "OPEN",
    userId: "u2",
    caseId: "c1",
    case: { number: 1, subjectUserId: "u2", snapshot: { applied: { action, prior } }, actions: [{ moderatorId: "m1", until: actionUntil, createdAt: at }] },
  };
}
const userPrior = { kind: "user", userId: "u2", status: "ACTIVE", suspendedUntil: null, messagingRestrictedUntil: null };
const OVERTURN = { decision: "OVERTURNED", note: "Einspruch ist berechtigt, Massnahme aufgehoben." };

beforeEach(() => {
  h.calls.length = 0;
  h.subjectRole = "MEMBER";
  h.postState = "PUBLISHED";
  h.laterShopDecision = false;
});

describe("revertPrior über decideAppeal", () => {
  it("Nachrichtensperre: nur wenn das „bis“ noch von dieser Massnahme stammt", async () => {
    h.appeal = appealFor("RESTRICT_MESSAGING", userPrior);
    await decideAppeal(MOD, "ap1", OVERTURN);
    const u = h.calls.find((c) => c.op === "user.updateMany")!.args as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(u.where).toEqual({ id: "u2", messagingRestrictedUntil: until });
    expect(u.data).toEqual({ messagingRestrictedUntil: null });
  });
  it("Sperre: nur bei SUSPENDED mit demselben „bis“", async () => {
    h.appeal = appealFor("SUSPEND", userPrior);
    await decideAppeal(MOD, "ap1", OVERTURN);
    const u = h.calls.find((c) => c.op === "user.updateMany")!.args as { where: Record<string, unknown> };
    expect(u.where).toEqual({ id: "u2", status: "SUSPENDED", suspendedUntil: until });
  });
  it("Bann: Shops nur, wenn die Moderation sie seither nicht selbst entschieden hat", async () => {
    h.appeal = appealFor("BAN", { ...userPrior, shops: [{ id: "s1", status: "ACTIVE" }] }, null);
    await decideAppeal(ADMIN, "ap1", OVERTURN);
    expect(h.calls.find((c) => c.op === "shop.updateMany")!.args).toEqual({ where: { id: "s1", status: "SUSPENDED" }, data: { status: "ACTIVE" } });
    h.calls.length = 0;
    h.laterShopDecision = true;
    await decideAppeal(ADMIN, "ap1", OVERTURN);
    expect(h.calls.some((c) => c.op === "shop.updateMany")).toBe(false);
  });
  it("Kontomassnahme gegen ein Teammitglied hebt nur die Superadministration auf", async () => {
    h.subjectRole = "PLATFORM_MODERATOR";
    h.appeal = appealFor("SUSPEND", userPrior);
    await expect(decideAppeal(ADMIN, "ap1", OVERTURN)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideAppeal(SUPER, "ap1", OVERTURN)).resolves.toBeUndefined();
    // Ablehnen bleibt allen Moderierenden möglich
    await expect(decideAppeal(MOD, "ap1", { decision: "UPHELD", note: "Die Sperre bleibt bestehen, siehe Fall." })).resolves.toBeUndefined();
  });
});

describe("applyToContent über decideCase", () => {
  const HIDE = { action: "HIDE", reason: "Verstoss gegen die Richtlinien", publicNote: "" };
  it("Verbergen überschreibt einen entfernten Inhalt nicht", async () => {
    h.postState = "REMOVED";
    await decideCase(MOD, "c1", HIDE);
    expect(h.calls.some((c) => c.op === "post.update")).toBe(false);
  });
  it("Verbergen eines sichtbaren Inhalts wirkt wie bisher", async () => {
    await decideCase(MOD, "c1", HIDE);
    expect(h.calls.find((c) => c.op === "post.update")!.args).toEqual({ where: { id: "p1" }, data: { state: "HIDDEN" } });
  });
});
