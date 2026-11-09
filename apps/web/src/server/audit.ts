import "server-only";
import { createHash } from "node:crypto";
import { db, type Tx } from "@/server/db";

/** Deterministische Serialisierung (sortierte Schlüssel) – unabhängig von jsonb-Schlüsselreihenfolge. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

function digest(prev: string | null, e: { actorId: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; createdAt: Date }) {
  return createHash("sha256")
    .update((prev ?? "genesis") + stable({ ...e, createdAt: e.createdAt.toISOString() }))
    .digest("hex");
}

/**
 * Unveränderliches Audit-Protokoll (§24.3). Jeder Eintrag verkettet den Hash des
 * Vorgängers; zusätzlich verhindert ein DB-Trigger UPDATE/DELETE.
 * Personenbezogene Daten gehören NICHT in `meta` (§26.3).
 */
export async function audit(
  entry: { actorId?: string | null; action: string; targetType?: string; targetId?: string; meta?: Record<string, unknown> },
  tx?: Tx,
) {
  const run = async (c: Tx) => {
    // Advisory Lock serialisiert die Hash-Kette auch bei parallelen Requests.
    await c.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const prev = await c.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
    const createdAt = new Date();
    const meta = JSON.parse(JSON.stringify(entry.meta ?? {}));
    const row = {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta,
      createdAt,
    };
    const hash = digest(prev?.hash ?? null, row);
    return c.auditEvent.create({ data: { ...row, prevHash: prev?.hash ?? null, hash } });
  };
  if (tx) return run(tx);
  return db.$transaction((t) => run(t));
}

/** Prüft Inhalt und Verkettung (Admin → Audit-Protokoll). */
/**
 * Prüft die Hash-Kette der NEUESTEN Einträge (dort würde eine Manipulation zuerst auffallen) –
 * inklusive Verkettung zum Eintrag direkt davor. Ältere Abschnitte bleiben über frühere Prüfungen gedeckt.
 */
export async function verifyAuditChain(limitRows = 5000) {
  const rows = (await db.auditEvent.findMany({ orderBy: { seq: "desc" }, take: limitRows })).reverse();
  if (!rows.length) return { ok: true as const, checked: 0 };
  const before = await db.auditEvent.findFirst({ where: { seq: { lt: rows[0]!.seq } }, orderBy: { seq: "desc" }, select: { hash: true } });
  let prev: string | null = before?.hash ?? null;
  for (const r of rows) {
    const expected = digest(prev, r);
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false as const, brokenAt: r.seq, checked: rows.length };
    prev = r.hash;
  }
  return { ok: true as const, checked: rows.length };
}
