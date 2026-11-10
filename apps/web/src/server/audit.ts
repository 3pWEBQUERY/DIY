import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db, type Tx } from "@/server/db";

/**
 * Hash-Verfahren der Audit-Kette.
 * - `sha256`: ältere Einträge (bzw. ohne AUDIT_HMAC_KEY) – jede:r mit Schreibzugriff auf die DB könnte die
 *   Kette nach Abschalten des Triggers neu berechnen.
 * - `hmac-sha256-v1`: HMAC mit eigenem Schlüssel (AUDIT_HMAC_KEY, nur in den Umgebungsvariablen von web/worker,
 *   nie in der DB). Ohne Schlüssel lässt sich ein gültiger Eintrag nicht neu berechnen.
 * Der Schlüssel darf nicht gewechselt werden (ältere HMAC-Einträge wären sonst nicht mehr prüfbar).
 */
export const AUDIT_ALG = { legacy: "sha256", hmac: "hmac-sha256-v1" } as const;

const MIN_KEY_LENGTH = 32;

/** Schlüssel aus AUDIT_HMAC_KEY (mind. 32 Zeichen), sonst null → alte Verkettung ohne Schlüssel. */
export function auditKey(): string | null {
  const k = process.env.AUDIT_HMAC_KEY?.trim();
  return k && k.length >= MIN_KEY_LENGTH ? k : null;
}

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

type Hashed = { actorId: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; createdAt: Date };

function digest(alg: string, prev: string | null, e: Hashed, key: string | null) {
  const payload = (prev ?? "genesis") + stable({ ...e, createdAt: e.createdAt.toISOString() });
  if (alg === AUDIT_ALG.hmac) {
    if (!key) throw new Error("AUDIT_HMAC_KEY fehlt");
    return createHmac("sha256", key).update(`werkuno-audit-v1:${payload}`).digest("hex");
  }
  return createHash("sha256").update(payload).digest("hex");
}

function checkpointMac(key: string, c: { seq: number; hash: string; createdAt: Date }) {
  return createHmac("sha256", key).update(`werkuno-audit-checkpoint-v1:${c.seq}:${c.hash}:${c.createdAt.toISOString()}`).digest("hex");
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Unveränderliches Audit-Protokoll (§24.3). Jeder Eintrag verkettet den Hash des
 * Vorgängers (mit AUDIT_HMAC_KEY als HMAC); zusätzlich verhindert ein DB-Trigger UPDATE/DELETE.
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
    const key = auditKey();
    const alg = key ? AUDIT_ALG.hmac : AUDIT_ALG.legacy;
    const hash = digest(alg, prev?.hash ?? null, row, key);
    return c.auditEvent.create({ data: { ...row, prevHash: prev?.hash ?? null, hash, alg } });
  };
  if (tx) return run(tx);
  return db.$transaction((t) => run(t));
}

export type AuditVerifyResult =
  | {
      ok: true;
      /** in diesem Lauf geprüfte Einträge */
      checked: number;
      /** Startpunkt: seq des Prüfpunkts, ab dem geprüft wurde (0 = vom ersten Eintrag an) */
      from: number;
      /** bis zu diesem Eintrag ist die Kette jetzt lückenlos geprüft */
      through: number;
      /** false: Zeilenbudget erschöpft – die nächste Prüfung macht ab `through` weiter */
      complete: boolean;
    }
  | { ok: false; checked: number; from: number; brokenAt: number; reason: string };

type Checkpoint = { id: string; seq: number; hash: string; mac: string | null; verifiedAt: Date | null; createdAt: Date };

/** Prüfpunkt echt? Mit Schlüssel: MAC muss stimmen; ohne MAC (vor dem Schlüssel angelegt) nur „unbeglaubigt“. */
function checkpointState(c: Checkpoint, key: string | null): "valid" | "unsigned" | "forged" | "unverifiable" {
  if (!c.mac) return "unsigned";
  if (!key) return "unverifiable";
  return sameHex(c.mac, checkpointMac(key, c)) ? "valid" : "forged";
}

/**
 * Prüft die Audit-Kette inkrementell: ab dem letzten geprüften, beglaubigten Prüfpunkt (dessen Eintrag
 * muss unverändert sein) bis zum aktuellen Kopf – `full: true` prüft vom ersten Eintrag an. Unterwegs muss
 * jeder Prüfpunkt zu seinem Eintrag passen; ein Prüfpunkt hinter dem Ende bedeutet gelöschte Einträge.
 * Nach erfolgreicher Prüfung wird ein neuer Prüfpunkt geschrieben (Startpunkt der nächsten Prüfung).
 *
 * Erkennt u. a.: veränderte/gelöschte/eingeschobene Einträge (Kette), neu berechnete Ketten (HMAC bzw.
 * Abweichung vom Prüfpunkt), Rückstufung auf SHA-256 nach HMAC-Einträgen, abgeschnittene Enden.
 */
export async function verifyAuditChain(opts: { full?: boolean; maxRows?: number; batch?: number; source?: "verify" | "worker" } = {}): Promise<AuditVerifyResult> {
  const key = auditKey();
  const maxRows = opts.maxRows ?? 200_000;
  const batch = opts.batch ?? 2000;
  const checkpoints: Checkpoint[] = await db.auditCheckpoint.findMany({ orderBy: [{ seq: "asc" }, { createdAt: "asc" }] });

  // Startpunkt: letzter geprüfter Prüfpunkt, der sich beglaubigen lässt (mit Schlüssel nur mit gültigem MAC)
  let start: Checkpoint | null = null;
  if (!opts.full) {
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      const c = checkpoints[i]!;
      if (!c.verifiedAt) continue;
      const st = checkpointState(c, key);
      if (st === "valid" || (st === "unsigned" && !key)) {
        start = c;
        break;
      }
    }
  }
  const from = start?.seq ?? 0;
  const broken = (brokenAt: number, reason: string, checked: number) => ({ ok: false as const, checked, from, brokenAt, reason });

  let prev: string | null = null;
  let sawHmac = false;
  if (start) {
    const anchor = await db.auditEvent.findUnique({ where: { seq: start.seq }, select: { hash: true, alg: true } });
    if (!anchor || anchor.hash !== start.hash) return broken(start.seq, "Eintrag weicht vom geprüften Prüfpunkt ab oder fehlt.", 0);
    prev = anchor.hash;
    sawHmac = anchor.alg === AUDIT_ALG.hmac;
  }

  const bySeq = new Map<number, Checkpoint[]>();
  for (const c of checkpoints) if (c.seq > from) bySeq.set(c.seq, [...(bySeq.get(c.seq) ?? []), c]);

  let cursor = from;
  let checked = 0;
  let complete = true;
  for (;;) {
    const rows = await db.auditEvent.findMany({ where: { seq: { gt: cursor } }, orderBy: { seq: "asc" }, take: batch });
    if (!rows.length) break;
    for (const r of rows) {
      if (r.alg === AUDIT_ALG.hmac) {
        if (!key) return broken(r.seq, "AUDIT_HMAC_KEY fehlt – Einträge mit Schlüssel lassen sich nicht prüfen.", checked);
        sawHmac = true;
      } else if (r.alg !== AUDIT_ALG.legacy) {
        return broken(r.seq, `Unbekanntes Hash-Verfahren „${r.alg}“.`, checked);
      } else if (sawHmac) {
        // Nach dem ersten HMAC-Eintrag nie wieder ohne Schlüssel – sonst könnte man das Ende neu berechnen
        return broken(r.seq, "Eintrag ohne Schlüssel nach Einträgen mit Schlüssel (Rückstufung).", checked);
      }
      // Nur die Felder hashen, die beim Schreiben gehasht wurden – nicht id/seq/prevHash/hash der Zeile
      const expected = digest(r.alg, prev, { actorId: r.actorId, action: r.action, targetType: r.targetType, targetId: r.targetId, meta: r.meta, createdAt: r.createdAt }, key);
      if (r.prevHash !== prev || r.hash !== expected) return broken(r.seq, "Inhalt oder Verkettung verändert.", checked);
      for (const c of bySeq.get(r.seq) ?? []) {
        if (checkpointState(c, key) === "forged") return broken(r.seq, "Prüfpunkt verfälscht.", checked);
        if (c.hash !== r.hash) return broken(r.seq, "Eintrag weicht von einem früheren Prüfpunkt ab.", checked);
      }
      bySeq.delete(r.seq);
      prev = r.hash;
      cursor = r.seq;
      checked++;
      if (checked >= maxRows) {
        complete = false;
        break;
      }
    }
    if (!complete || rows.length < batch) break;
  }
  // Prüfpunkte hinter dem letzten Eintrag: dort gab es einmal Einträge → das Ende wurde abgeschnitten
  if (complete) {
    const lost = [...bySeq.values()].flat()[0];
    if (lost) return broken(lost.seq, checkpointState(lost, key) === "forged" ? "Prüfpunkt verfälscht." : "Einträge fehlen: ein Prüfpunkt verweist auf einen gelöschten Eintrag.", checked);
  }
  if (checked > 0) await writeCheckpoint(cursor, prev!, opts.source ?? "verify", true);
  return { ok: true, checked, from, through: cursor, complete };
}

async function writeCheckpoint(seq: number, hash: string, source: "verify" | "worker", verified: boolean) {
  const key = auditKey();
  const createdAt = new Date();
  return db.auditCheckpoint.create({
    data: { seq, hash, createdAt, source, verifiedAt: verified ? createdAt : null, mac: key ? checkpointMac(key, { seq, hash, createdAt }) : null },
  });
}

/**
 * Täglicher Prüfpunkt (Worker): Kette inkrementell prüfen, Kopf als Prüfpunkt festhalten und als
 * strukturierte Log-Zeile `audit_checkpoint` ausgeben – die Logs liegen ausserhalb der Datenbank, eine
 * später neu berechnete Kette fällt beim Vergleich mit ihnen auf.
 */
export async function auditCheckpointJob(log: (line: Record<string, unknown>) => void = (l) => console.log(JSON.stringify(l))) {
  const r = await verifyAuditChain({ source: "worker", maxRows: 1_000_000 });
  const head = await db.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  if (!head) return r;
  // Kopf bei fehlgeschlagener/unvollständiger Prüfung trotzdem verankern (ungeprüft – kein Startpunkt)
  const cp = r.ok && r.complete && r.through === head.seq ? null : await writeCheckpoint(head.seq, head.hash, "worker", false);
  const last = cp ?? (await db.auditCheckpoint.findFirst({ where: { seq: head.seq }, orderBy: { createdAt: "desc" } }));
  log({
    level: r.ok ? "info" : "error",
    svc: "worker",
    msg: "audit_checkpoint",
    seq: head.seq,
    hash: head.hash,
    at: (last?.createdAt ?? new Date()).toISOString(),
    alg: auditKey() ? AUDIT_ALG.hmac : AUDIT_ALG.legacy,
    verified: r.ok && r.complete,
    ...(r.ok ? { checked: r.checked } : { brokenAt: r.brokenAt, reason: r.reason }),
  });
  if (!r.ok) {
    const { captureError } = await import("@/server/monitoring");
    const e = new Error(`Audit-Kette gebrochen bei Eintrag #${r.brokenAt}: ${r.reason}`);
    e.name = "AuditChainBroken";
    await captureError(e, { source: "WORKER", path: "audit.checkpoint" });
  }
  return r;
}
