import "server-only";
import { z } from "zod";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { audit, verifyAuditChain } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { SETTING_DEFAULTS, type SettingKey } from "@/server/settings";
import type { SessionUser } from "@/server/auth/session";

/** Systemkonfiguration & Audit-Protokoll – nur ADMIN (§24.3). */

type Actor = Pick<SessionUser, "id" | "role">;
function admin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
}

/** Beschreibung & Grenzen je Einstellung – steuert die typgerechten Eingaben. */
export const SETTING_META: Record<SettingKey, { label: string; help: string; group: string; unit?: string; min?: number; max?: number; format?: "bps" }> = {
  "commerce.feeBps": { label: "Plattformprovision", help: "In Basispunkten (600 = 6 %). Wird vor dem Kauf transparent ausgewiesen.", group: "Marktplatz", unit: "bps", min: 0, max: 3000, format: "bps" },
  "commerce.reservationMinutes": { label: "Reservierungsdauer im Checkout", help: "So lange bleibt Ware während der Zahlung reserviert.", group: "Marktplatz", unit: "Min.", min: 5, max: 120 },
  "commerce.digitalEnabledWeb": { label: "Digitale Produkte im Web", help: "Verkauf digitaler Anleitungen über die Website.", group: "Marktplatz" },
  "commerce.digitalEnabledIos": { label: "Digitale Produkte in iOS", help: "Erst nach Klärung der App-Store-Regeln aktivieren (§13.7).", group: "Marktplatz" },
  "media.maxImageMb": { label: "Max. Bildgrösse", help: "Pro Datei.", group: "Medien", unit: "MB", min: 1, max: 50 },
  "media.maxVideoMb": { label: "Max. Videogrösse", help: "Pro Datei.", group: "Medien", unit: "MB", min: 10, max: 2000 },
  "media.maxVideoSeconds": { label: "Max. Videolänge", help: "Längere Videos werden abgelehnt.", group: "Medien", unit: "Sek.", min: 10, max: 1800 },
  "feed.authorCap": { label: "Beiträge pro Autor je Feed-Seite", help: "Sichert Vielfalt im Feed (§9.5).", group: "Feed", min: 1, max: 10 },
  "signup.minAge": { label: "Mindestalter", help: "Plattform ist für Erwachsene konzipiert (§8.4).", group: "Registrierung", unit: "Jahre", min: 16, max: 21 },
};

export async function listSettings() {
  const rows = await db.systemSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => {
    const row = byKey.get(key);
    const def = SETTING_DEFAULTS[key];
    return { key, value: (row?.value ?? def) as number | boolean, default: def, isDefault: !row, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null, meta: SETTING_META[key] };
  });
}

export async function updateSetting(actor: Actor, key: string, raw: unknown) {
  admin(actor);
  if (!(key in SETTING_DEFAULTS)) throw fail.invalid("Unbekannte Einstellung.");
  const k = key as SettingKey;
  const def = SETTING_DEFAULTS[k];
  const meta = SETTING_META[k];
  let value: number | boolean;
  if (typeof def === "boolean") value = z.coerce.boolean().parse(raw === "false" ? false : raw);
  else {
    value = z.coerce.number().int("Ganzzahl erwartet").min(meta.min ?? 0, `Mindestens ${meta.min}`).max(meta.max ?? 1_000_000, `Höchstens ${meta.max}`).parse(raw);
  }
  // Provisionserhöhungen sind kritisch → nur SUPERADMIN
  if (k === "commerce.feeBps" && !hasRole(actor, "SUPERADMIN")) throw fail.forbidden("Die Provision ändert nur die Superadministration.");
  const prev = await db.systemSetting.findUnique({ where: { key } });
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedBy: actor.id }, update: { value: value as Prisma.InputJsonValue, updatedBy: actor.id } });
    await audit({ actorId: actor.id, action: "admin.setting_changed", targetType: "SYSTEM_SETTING", targetId: key, meta: { from: (prev?.value ?? def) as number | boolean, to: value } }, tx);
  });
}

export async function resetSetting(actor: Actor, key: string) {
  admin(actor);
  if (!(key in SETTING_DEFAULTS)) throw fail.invalid("Unbekannte Einstellung.");
  if (key === "commerce.feeBps" && !hasRole(actor, "SUPERADMIN")) throw fail.forbidden("Die Provision ändert nur die Superadministration.");
  await db.$transaction(async (tx) => {
    const del = await tx.systemSetting.deleteMany({ where: { key } });
    if (del.count) await audit({ actorId: actor.id, action: "admin.setting_reset", targetType: "SYSTEM_SETTING", targetId: key }, tx);
  });
}

export async function listFlags() {
  return db.featureFlag.findMany({ orderBy: { key: "asc" } });
}

const flagSchema = z.object({
  key: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9_.-]+$/, "Nur a–z, 0–9, Punkt, Bindestrich, Unterstrich"),
  description: z.string().trim().max(300).default(""),
  rollout: z.coerce.number().int().min(0).max(100).default(100),
  enabled: z.boolean().default(false),
});

export async function upsertFlag(actor: Actor, input: unknown) {
  admin(actor);
  const d = flagSchema.parse(input);
  const prev = await db.featureFlag.findUnique({ where: { key: d.key } });
  await db.$transaction(async (tx) => {
    await tx.featureFlag.upsert({ where: { key: d.key }, create: d, update: d });
    await audit({ actorId: actor.id, action: prev ? "admin.flag_updated" : "admin.flag_created", targetType: "FEATURE_FLAG", targetId: d.key, meta: { enabled: d.enabled, rollout: d.rollout, wasEnabled: prev?.enabled ?? null } }, tx);
  });
}

export async function toggleFlag(actor: Actor, key: string, enabled: boolean) {
  admin(actor);
  await db.$transaction(async (tx) => {
    const f = await tx.featureFlag.update({ where: { key }, data: { enabled } });
    await audit({ actorId: actor.id, action: "admin.flag_toggled", targetType: "FEATURE_FLAG", targetId: key, meta: { enabled, rollout: f.rollout } }, tx);
  });
}

/* ───────────── Audit-Protokoll ───────────── */

export async function listAudit(actor: Actor, opts: { action?: string | null; actor?: string | null; targetType?: string | null; targetId?: string | null; from?: string | null; to?: string | null; page?: number }) {
  admin(actor);
  const page = Math.max(1, opts.page ?? 1);
  const from = opts.from ? new Date(opts.from) : null;
  const to = opts.to ? new Date(`${opts.to}T23:59:59.999Z`) : null;
  const where: Prisma.AuditEventWhereInput = {
    ...(opts.action ? { action: { startsWith: opts.action } } : {}),
    ...(opts.targetType ? { targetType: opts.targetType } : {}),
    ...(opts.targetId ? { targetId: opts.targetId } : {}),
    ...(opts.actor ? { actor: { profile: { handle: opts.actor.replace(/^@/, "").toLowerCase() } } } : {}),
    ...(from && !Number.isNaN(from.getTime()) ? { createdAt: { gte: from, ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) } } : to && !Number.isNaN(to.getTime()) ? { createdAt: { lte: to } } : {}),
  };
  const [rows, total, prefixes] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { seq: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      include: { actor: { select: { id: true, profile: { select: { handle: true } } } } },
    }),
    db.auditEvent.count({ where }),
    db.$queryRaw<{ prefix: string; n: bigint }[]>`SELECT split_part("action", '.', 1) AS prefix, count(*)::bigint AS n FROM "AuditEvent" GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 50)), prefixes: prefixes.map((p) => ({ prefix: p.prefix, n: Number(p.n) })) };
}

export async function checkAuditIntegrity(actor: Actor) {
  admin(actor);
  const r = await verifyAuditChain(50_000);
  await audit({ actorId: actor.id, action: "admin.audit_verified", targetType: "AUDIT", meta: { ok: r.ok, checked: r.checked, brokenAt: r.ok ? null : r.brokenAt } });
  return r;
}
