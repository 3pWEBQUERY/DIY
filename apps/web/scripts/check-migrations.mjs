#!/usr/bin/env node
/**
 * Prüft die Reihenfolge der Prisma-Migrationen (CI-Wächter, siehe docs/ENGINEERING.md).
 *
 * Prisma wendet Migrationen in der Reihenfolge ihrer Ordnernamen an. Die bestehenden Migrationen
 * tragen Zeitstempel in der Zukunft (bis 20261119…) – eine heute mit `prisma migrate dev` erzeugte
 * Migration sortiert deshalb VOR bereits angewendete. Angewendete Migrationen dürfen nicht umbenannt
 * werden (sonst passt `_prisma_migrations` nicht mehr), also müssen neue immer hinten anstehen.
 *
 * Regeln:
 *  1. Ordnername `JJJJMMTThhmmss_name` (14 Ziffern, Kleinbuchstaben/Ziffern/_), mit `migration.sql`,
 *     Zeitstempel eindeutig.
 *  2. Git-Historie: Eine später hinzugefügte Migration darf nicht vor einer früher hinzugefügten
 *     sortieren (nicht eingecheckte Ordner zählen als neueste).
 *  3. Mit Basis (`--base <ref>` oder MIGRATIONS_BASE_REF, z. B. `origin/main`): keine Migration der Basis
 *     fehlt oder wurde umbenannt, und jede neue sortiert nach der letzten der Basis.
 *
 *   node scripts/check-migrations.mjs [--base origin/main]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "prisma", "migrations");
const NAME = /^(\d{14})_[a-z0-9_]+$/;

const errors = [];
const repoRoot = git(["rev-parse", "--show-toplevel"], migrationsDir)?.trim() || null;
const notes = [];

function git(args, cwd = repoRoot ?? migrationsDir) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const local = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

// 1. Namensschema, migration.sql, eindeutige Zeitstempel
const stamps = new Map();
for (const m of local) {
  const match = NAME.exec(m);
  if (!match) errors.push(`${m}: Name muss dem Schema JJJJMMTThhmmss_name entsprechen (Kleinbuchstaben, Ziffern, _).`);
  if (!existsSync(join(migrationsDir, m, "migration.sql"))) errors.push(`${m}: migration.sql fehlt.`);
  if (match) {
    if (stamps.has(match[1])) errors.push(`${m}: Zeitstempel ${match[1]} schon vergeben (${stamps.get(match[1])}).`);
    stamps.set(match[1], m);
  }
}

// 2. Reihenfolge laut Git-Historie (Reihenfolge, in der die Ordner hinzugefügt wurden)
if (repoRoot) {
  const rel = relative(repoRoot, migrationsDir).split("\\").join("/");
  const log = git(["log", "--reverse", "--diff-filter=A", "--name-only", "--format=%x00%H", "--", rel]) ?? "";
  const added = new Map();
  let commit = -1;
  for (const line of log.split("\n")) {
    if (line.startsWith("\0")) commit++;
    else if (line.startsWith(`${rel}/`)) {
      const name = line.slice(rel.length + 1).split("/")[0];
      if (!added.has(name)) added.set(name, commit);
    }
  }
  if (git(["rev-parse", "--is-shallow-repository"])?.trim() === "true") notes.push("Flacher Klon – Historienprüfung nur eingeschränkt aussagekräftig (CI: fetch-depth: 0).");
  let latest = null;
  const reported = new Set();
  for (const m of local) {
    const order = added.get(m) ?? Number.POSITIVE_INFINITY;
    if (latest && order < latest.order && !reported.has(latest.name)) {
      reported.add(latest.name);
      // Nur Hinweis: Parallel entstandene Branches werden nicht in Zeitstempel-Reihenfolge zusammengeführt.
      // Massgeblich für die Datenbank ist der Basisvergleich (3.): neue Migrationen nach der letzten ausgerollten.
      notes.push(`${latest.name} wurde nach ${m} hinzugefügt, sortiert aber davor. Neue Migrationen immer mit einem Zeitstempel nach der letzten benennen.`);
    }
    if (!latest || order >= latest.order) latest = { name: m, order };
  }
} else {
  notes.push("Kein Git-Repository – Historienprüfung übersprungen.");
}

// 3. Vergleich mit der Basis (Pull Request: Zielbranch; Push: vorheriger Stand)
const argIdx = process.argv.indexOf("--base");
const base = (argIdx > -1 ? process.argv[argIdx + 1] : process.env.MIGRATIONS_BASE_REF)?.trim();
if (base && !/^0+$/.test(base)) {
  const rel = repoRoot ? relative(repoRoot, migrationsDir).split("\\").join("/") : "apps/web/prisma/migrations";
  const tree = git(["ls-tree", "--name-only", `${base}:${rel}`]);
  if (tree == null) {
    notes.push(`Basis ${base} nicht gefunden – Basisvergleich übersprungen.`);
  } else {
    const baseNames = tree.split("\n").filter((n) => NAME.test(n)).sort();
    const localSet = new Set(local);
    for (const b of baseNames) {
      if (!localSet.has(b)) errors.push(`${b}: existiert auf ${base}, fehlt hier. Angewendete Migrationen nie umbenennen oder löschen.`);
    }
    const lastBase = baseNames[baseNames.length - 1];
    const baseSet = new Set(baseNames);
    for (const m of local) {
      if (!baseSet.has(m) && lastBase && m <= lastBase) errors.push(`${m}: neu, sortiert aber nicht nach der letzten Migration auf ${base} (${lastBase}).`);
    }
  }
}

const last = local[local.length - 1];
for (const n of notes) console.log(`Hinweis: ${n}`);
if (errors.length) {
  console.error("Migrationsreihenfolge fehlerhaft:");
  for (const e of errors) console.error(`  - ${e}`);
  const m = last && NAME.exec(last);
  if (m) {
    const s = m[1];
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)) + 3600_000);
    const next = d.toISOString().replace(/\D/g, "").slice(0, 14);
    console.error(`Vorschlag für die nächste Migration: ${next}_<name> (letzte: ${last}).`);
  }
  process.exit(1);
}
console.log(`Migrationen in Ordnung (${local.length}, letzte: ${last}).`);
