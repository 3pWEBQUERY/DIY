import { beforeEach, describe, expect, it, vi } from "vitest";

// In-Memory-Ersatz für AuditEvent/AuditCheckpoint: schreibt wie Prisma (id/seq/prevHash/hash/alg) und liest volle Zeilen
type Row = { id: string; seq: number; actorId: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; prevHash: string | null; hash: string; alg: string; createdAt: Date };
type Cp = { id: string; seq: number; hash: string; mac: string | null; verifiedAt: Date | null; source: string; createdAt: Date };
let rows: Row[] = [];
let cps: Cp[] = [];
let nextSeq = 1;
const table = {
  findFirst: async (q: { where?: { seq?: { lt: number } } }) => {
    const list = q.where?.seq ? rows.filter((r) => r.seq < q.where!.seq!.lt) : rows;
    return list[list.length - 1] ?? null;
  },
  findUnique: async (q: { where: { seq: number } }) => rows.find((r) => r.seq === q.where.seq) ?? null,
  findMany: async (q: { where?: { seq?: { gt: number } }; take?: number }) => {
    const list = rows.filter((r) => r.seq > (q.where?.seq?.gt ?? -Infinity));
    return list.slice(0, q.take ?? list.length);
  },
  create: async ({ data }: { data: Omit<Row, "id" | "seq"> }) => {
    const r = { ...data, id: `id${nextSeq}`, seq: nextSeq++ };
    rows.push(r);
    return r;
  },
};
const checkpoints = {
  findMany: async () => [...cps].sort((a, b) => a.seq - b.seq || a.createdAt.getTime() - b.createdAt.getTime()),
  findFirst: async (q: { where?: { seq?: number } }) => [...cps].reverse().find((c) => q.where?.seq === undefined || c.seq === q.where.seq) ?? null,
  create: async ({ data }: { data: Omit<Cp, "id"> }) => {
    const c = { ...data, id: `cp${cps.length + 1}` };
    cps.push(c);
    return c;
  },
};
const client = { auditEvent: table, auditCheckpoint: checkpoints, $executeRaw: async () => 0 };
vi.mock("@/server/db", () => ({ db: { ...client, $transaction: (fn: (t: typeof client) => unknown) => fn(client) } }));
const captured: unknown[] = [];
vi.mock("@/server/monitoring", () => ({ captureError: async (e: unknown) => void captured.push(e) }));
const { audit, verifyAuditChain, auditCheckpointJob, AUDIT_ALG } = await import("../audit");

const KEY = "k".repeat(40);

beforeEach(() => {
  rows = [];
  cps = [];
  nextSeq = 1;
  captured.length = 0;
  delete process.env.AUDIT_HMAC_KEY;
});

async function seed(n: number) {
  for (let i = 0; i < n; i++) await audit({ actorId: `u${i}`, action: `a.${i}`, targetType: "USER", targetId: `t${i}`, meta: { i, nested: { z: 1, y: [1, 2] } } });
}

describe("Audit-Kette ohne Schlüssel (bisheriges Verfahren)", () => {
  it("unveränderte Kette ist gültig, Einträge als sha256 markiert", async () => {
    await audit({ actorId: "u1", action: "a.one", targetType: "USER", targetId: "u2", meta: { b: 2, a: 1 } });
    await audit({ action: "a.two" });
    await audit({ actorId: "u3", action: "a.three", meta: { nested: { z: 1, y: [1, 2] } } });
    expect(rows.every((r) => r.alg === AUDIT_ALG.legacy)).toBe(true);
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 3, from: 0, through: 3, complete: true });
  });
  it("erkennt manipulierte Einträge", async () => {
    await seed(3);
    rows[1]!.action = "a.manipuliert";
    const r = await verifyAuditChain();
    expect(r).toMatchObject({ ok: false, brokenAt: 2 });
  });
});

describe("HMAC (AUDIT_HMAC_KEY)", () => {
  it("neue Einträge mit Schlüssel; ältere bleiben prüfbar", async () => {
    await seed(2);
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(2);
    expect(rows.map((r) => r.alg)).toEqual(["sha256", "sha256", "hmac-sha256-v1", "hmac-sha256-v1"]);
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 4 });
  });
  it("ohne den Schlüssel neu berechnete Kette fällt auf", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(3);
    // Angreifer mit DB-Zugriff, aber anderem Schlüssel: Eintrag 2 ändern und alles ab dort „neu berechnen“
    const all = rows;
    rows = all.slice(0, 1);
    nextSeq = 2;
    process.env.AUDIT_HMAC_KEY = "x".repeat(40);
    await audit({ actorId: "u1", action: "a.gefälscht", targetType: "USER", targetId: "t1", meta: {} });
    await audit({ actorId: "u2", action: "a.2", targetType: "USER", targetId: "t2", meta: {} });
    process.env.AUDIT_HMAC_KEY = KEY;
    expect(await verifyAuditChain({ full: true })).toMatchObject({ ok: false, brokenAt: 2 });
  });
  it("Rückstufung auf SHA-256 nach HMAC-Einträgen ist ein Bruch", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(2);
    delete process.env.AUDIT_HMAC_KEY;
    await seed(1);
    process.env.AUDIT_HMAC_KEY = KEY;
    expect(await verifyAuditChain({ full: true })).toMatchObject({ ok: false, brokenAt: 3, reason: expect.stringContaining("Rückstufung") });
  });
  it("fehlender Schlüssel macht HMAC-Einträge unprüfbar statt „intakt“", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(2);
    delete process.env.AUDIT_HMAC_KEY;
    expect(await verifyAuditChain({ full: true })).toMatchObject({ ok: false, brokenAt: 1, reason: expect.stringContaining("AUDIT_HMAC_KEY") });
  });
  it("zu kurzer Schlüssel wird ignoriert", async () => {
    process.env.AUDIT_HMAC_KEY = "kurz";
    await seed(1);
    expect(rows[0]!.alg).toBe(AUDIT_ALG.legacy);
  });
});

describe("Prüfpunkte und inkrementelle Prüfung", () => {
  it("setzt am letzten geprüften Prüfpunkt fort statt alles neu zu prüfen", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(5);
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 5, from: 0, through: 5 });
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({ seq: 5, hash: rows[4]!.hash, source: "verify" });
    expect(cps[0]!.mac).toMatch(/^[0-9a-f]{64}$/);
    await seed(3);
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 3, from: 5, through: 8 });
    // Nichts Neues → nichts zu prüfen, kein weiterer Prüfpunkt
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 0, from: 8, through: 8 });
    expect(cps).toHaveLength(2);
  });
  it("Zeilenbudget: Teilprüfung, nächste Prüfung macht dort weiter (auch über Seitengrenzen)", async () => {
    await seed(7);
    expect(await verifyAuditChain({ maxRows: 4, batch: 3 })).toMatchObject({ ok: true, checked: 4, through: 4, complete: false });
    expect(await verifyAuditChain({ maxRows: 4, batch: 3 })).toMatchObject({ ok: true, checked: 3, from: 4, through: 7, complete: true });
  });
  it("Manipulation vor dem Prüfpunkt: Startpunkt passt nicht mehr bzw. vollständige Prüfung findet sie", async () => {
    await seed(4);
    await verifyAuditChain();
    await seed(2);
    rows[1]!.meta = { anders: true };
    // Inkrementell: Eintrag 4 (Startpunkt) ist unverändert → neue Einträge sind intakt …
    expect(await verifyAuditChain()).toMatchObject({ ok: true, from: 4 });
    // … die vollständige Prüfung deckt den älteren Eingriff auf
    expect(await verifyAuditChain({ full: true })).toMatchObject({ ok: false, brokenAt: 2 });
  });
  it("neu berechneter Eintrag am Prüfpunkt fällt auf", async () => {
    await seed(3);
    await verifyAuditChain();
    rows[2]!.hash = "f".repeat(64);
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAt: 3 });
  });
  it("abgeschnittenes Ende (gelöschte neueste Einträge) wird über einen späteren Prüfpunkt erkannt", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(3);
    await verifyAuditChain();
    await seed(3);
    await verifyAuditChain();
    rows = rows.slice(0, 4);
    expect(await verifyAuditChain({ full: true })).toMatchObject({ ok: false, brokenAt: 6, reason: expect.stringContaining("fehlen") });
  });
  it("gefälschter Prüfpunkt (falscher MAC) wird nicht als Startpunkt genutzt und gemeldet", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(4);
    cps.push({ id: "fake", seq: 3, hash: rows[2]!.hash, mac: "0".repeat(64), verifiedAt: new Date(), source: "verify", createdAt: new Date() });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAt: 3, from: 0, reason: expect.stringContaining("verfälscht") });
  });
  it("täglicher Job schreibt Prüfpunkt und Log-Zeile; ein Bruch wird gemeldet", async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    await seed(3);
    const lines: Record<string, unknown>[] = [];
    expect(await auditCheckpointJob((l) => lines.push(l))).toMatchObject({ ok: true, through: 3 });
    expect(lines[0]).toMatchObject({ msg: "audit_checkpoint", level: "info", seq: 3, hash: rows[2]!.hash, verified: true, alg: "hmac-sha256-v1" });
    expect(cps.at(-1)).toMatchObject({ seq: 3, source: "worker" });
    expect(cps.at(-1)!.verifiedAt).not.toBeNull();

    rows[0]!.action = "x";
    await seed(1);
    lines.length = 0;
    // Inkrementell ab Prüfpunkt 3 ist der neue Eintrag intakt; vollständig geprüft wird separat
    expect(await auditCheckpointJob((l) => lines.push(l))).toMatchObject({ ok: true });
    // Eintrag am letzten Prüfpunkt „neu berechnet“
    rows[3]!.hash = "e".repeat(64);
    lines.length = 0;
    expect(await auditCheckpointJob((l) => lines.push(l))).toMatchObject({ ok: false, brokenAt: 4 });
    expect(lines[0]).toMatchObject({ level: "error", verified: false, brokenAt: 4 });
    // Kopf trotzdem verankert, aber nicht als geprüfter Startpunkt
    expect(cps.at(-1)).toMatchObject({ seq: 4, verifiedAt: null });
    expect(captured).toHaveLength(1);
  });
});
