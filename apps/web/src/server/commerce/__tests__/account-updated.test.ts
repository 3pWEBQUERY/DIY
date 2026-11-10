import { beforeEach, describe, expect, it, vi } from "vitest";

// Webhook account.updated ohne Datenbank und ohne Stripe: nur der Ablauf wird geprüft
const applied: unknown[] = [];
const raw: string[] = [];
let retrieve: () => Promise<unknown> = async () => null;

vi.mock("@/server/db", () => ({
  db: { $executeRaw: vi.fn(async (strings: TemplateStringsArray) => (raw.push(strings.join("?")), 1)) },
}));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/monitoring", () => ({ captureError: vi.fn() }));
vi.mock("../reservations", () => ({ cancelPendingOrderTx: vi.fn() }));
vi.mock("../shops", () => ({ applyAccountStatus: vi.fn(async (s: unknown) => (applied.push(s), null)) }));
vi.mock("../stripe", () => ({
  retrieveConnectStatus: vi.fn(() => retrieve()),
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  isStripeError: () => false,
  listRefunds: vi.fn(),
  reverseTransferForDispute: vi.fn(),
}));

const { handleStripeEvent } = await import("../payments");

// v1-Objekt eines v2-Empfängerkontos: charges_enabled bleibt dort immer false
const event = { type: "account.updated", data: { object: { id: "acct_1", charges_enabled: false, payouts_enabled: false, details_submitted: true, requirements: null } } } as never;

describe("Webhook account.updated", () => {
  beforeEach(() => {
    applied.length = 0;
    raw.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("übernimmt den v2-Status", async () => {
    const status = { accountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null, currentlyDue: 0 };
    retrieve = async () => status;
    await handleStripeEvent(event);
    expect(applied).toEqual([status]);
    expect(raw).toHaveLength(0);
  });

  it("v2-Status nicht abrufbar: keine Herabstufung über den v1-Status, Konto für den Abgleich vormerken", async () => {
    retrieve = async () => {
      throw new Error("Stripe nicht erreichbar");
    };
    await handleStripeEvent(event);
    expect(applied).toHaveLength(0);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatch(/"connectSyncAt" = NULL/);
  });
});
