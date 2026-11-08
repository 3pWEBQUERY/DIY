import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { fail } from "@/server/errors";

/**
 * Feature-Flags: feste Liste von Schaltern, die im Code tatsächlich abgefragt werden.
 * Umschalten unter Admin → System wirkt beim nächsten Request (ohne Deploy).
 * `rollout` < 100 % schaltet ein Flag nur für einen festen Anteil angemeldeter Konten frei
 * (stabil pro Konto); Gäste sehen es dann nicht.
 */
export const FLAGS = {
  marketplace: {
    label: "Marktplatz",
    description: "Marktplatz, Warenkorb, Kasse und Shop-Verwaltung. Aus: Marktplatz ausgeblendet, keine neuen Bestellungen. Bestehende Bestellungen bleiben einsehbar.",
    default: true,
  },
  signup: {
    label: "Registrierung",
    description: "Neue Konten anlegen (E-Mail, Apple, App). Aus: Nur bestehende Konten können sich anmelden.",
    default: true,
  },
  "communities.create": {
    label: "Communities gründen",
    description: "Mitglieder können neue Communities gründen. Bestehende Communities sind nicht betroffen.",
    default: true,
  },
  "messages.new": {
    label: "Neue Unterhaltungen",
    description: "Neue Direktnachrichten beginnen. Aus: Bestehende Gespräche laufen weiter – Notbremse bei Spamwellen.",
    default: true,
  },
  "uploads.video": {
    label: "Video-Uploads",
    description: "Videos in Beiträgen und Projekten hochladen. Fotos sind nicht betroffen.",
    default: true,
  },
  pro: {
    label: "Creator Pro buchbar",
    description: "Creator Pro abschliessen (Abo). Aus: Keine neuen Abos – bestehende Abos und geschenkte Zugänge bleiben aktiv.",
    default: true,
  },
  realtime: {
    label: "Live-Updates",
    description: "Badges, Benachrichtigungen und Chats in Echtzeit. Aus: Aktualisierung alle paar Sekunden statt sofort (entlastet den Server).",
    default: true,
  },
} as const satisfies Record<string, { label: string; description: string; default: boolean }>;

export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

const PAUSED_MESSAGE: Record<FlagKey, string> = {
  marketplace: "Der Marktplatz ist gerade pausiert. Bitte versuche es später erneut.",
  signup: "Neue Registrierungen sind gerade pausiert. Bitte versuche es später erneut.",
  "communities.create": "Neue Communities können gerade nicht gegründet werden.",
  "messages.new": "Neue Unterhaltungen sind gerade pausiert. Bestehende Gespräche funktionieren weiter.",
  "uploads.video": "Video-Uploads sind gerade pausiert. Fotos kannst du weiterhin hochladen.",
  pro: "Creator Pro kann gerade nicht abgeschlossen werden. Bitte versuche es später erneut.",
  realtime: "Live-Updates sind gerade pausiert.",
};

const allFlags = cache(async () => {
  const rows = await db.featureFlag.findMany({ where: { key: { in: FLAG_KEYS } }, select: { key: true, enabled: true, rollout: true } }).catch(() => []);
  return new Map(rows.map((r) => [r.key, r]));
});

/** Stabiler Bucket 0–99 pro Konto und Flag (gleiches Konto → gleiches Ergebnis). */
export function rolloutBucket(key: string, userId: string) {
  return createHash("sha256").update(`${key}:${userId}`).digest().readUInt16BE(0) % 100;
}

export async function flagEnabled(key: FlagKey, userId?: string | null) {
  const row = (await allFlags()).get(key);
  if (!row) return FLAGS[key].default;
  if (!row.enabled) return false;
  if (row.rollout >= 100) return true;
  if (!userId || row.rollout <= 0) return false;
  return rolloutBucket(key, userId) < row.rollout;
}

/** Alle Flags für eine Person (z. B. für Navigation und Client-Komponenten). */
export async function flagsFor(userId?: string | null) {
  const out = {} as Record<FlagKey, boolean>;
  await Promise.all(FLAG_KEYS.map(async (k) => (out[k] = await flagEnabled(k, userId))));
  return out;
}

/** Serverseitige Sperre: wirft „nicht verfügbar“, wenn das Flag aus ist. */
export async function requireFlag(key: FlagKey, userId?: string | null) {
  if (!(await flagEnabled(key, userId))) throw fail.unavailable(PAUSED_MESSAGE[key]);
}

export const flagPausedMessage = (key: FlagKey) => PAUSED_MESSAGE[key];
