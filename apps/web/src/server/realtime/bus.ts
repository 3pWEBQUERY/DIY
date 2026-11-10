import "server-only";
import { EventEmitter } from "node:events";
import pg from "pg";
import { db } from "@/server/db";

/**
 * Echtzeit-Bus über Postgres LISTEN/NOTIFY: jede Server-Instanz hält eine einzige
 * LISTEN-Verbindung und verteilt Ereignisse an die offenen SSE-Streams ihrer Nutzer.
 * Funktioniert auch mit mehreren Instanzen, weil NOTIFY an alle Verbindungen geht.
 */
const CHANNEL = "werkuno_live";

export type LiveEvent =
  | { t: "message"; c: string } // neue Nachricht in Unterhaltung c
  | { t: "read"; c: string } // Unterhaltung c gelesen (andere Tabs aktualisieren)
  | { t: "counts" }; // Zähler haben sich geändert (z. B. neue Benachrichtigung)

type Payload = { u: string[]; e: LiveEvent };

const g = globalThis as unknown as { __werkunoBus?: { emitter: EventEmitter; ready: Promise<void> | null } };
const state = (g.__werkunoBus ??= { emitter: new EventEmitter().setMaxListeners(0), ready: null });

function connect(): Promise<void> {
  if (state.ready) return state.ready;
  state.ready = (async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const p = JSON.parse(msg.payload) as Payload;
        for (const u of p.u) state.emitter.emit(u, p.e);
      } catch {
        /* defekte Nutzlast ignorieren */
      }
    });
    const reset = () => {
      state.ready = null;
      client.removeAllListeners();
      void client.end().catch(() => {});
      // Offene Streams verbinden sich über den Browser neu (EventSource reconnect)
      state.emitter.emit("__reset");
    };
    client.on("error", reset);
    client.on("end", reset);
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
  })().catch((e) => {
    state.ready = null;
    throw e;
  });
  return state.ready;
}

/**
 * pg_notify nimmt höchstens 8000 Byte Nutzlast an (sonst „payload string too long“). Ein Fan-out an
 * 500 Personen (≈ 14 KB IDs) ginge sonst komplett verloren → Empfänger:innen auf mehrere Nachrichten
 * mit je höchstens `maxBytes` verteilen. IDs sind ASCII (cuid), Länge = Bytes.
 */
export const NOTIFY_MAX_BYTES = 7500;
export function chunkPayloads(userIds: string[], e: LiveEvent, maxBytes = NOTIFY_MAX_BYTES): string[] {
  const overhead = Buffer.byteLength(JSON.stringify({ u: [], e } satisfies Payload));
  const out: string[] = [];
  let cur: string[] = [];
  let size = overhead;
  for (const id of userIds) {
    const len = Buffer.byteLength(JSON.stringify(id));
    if (cur.length && size + 1 + len > maxBytes) {
      out.push(JSON.stringify({ u: cur, e } satisfies Payload));
      cur = [];
      size = overhead;
    }
    size += len + (cur.length ? 1 : 0); // Komma zwischen Einträgen
    cur.push(id);
  }
  if (cur.length) out.push(JSON.stringify({ u: cur, e } satisfies Payload));
  return out;
}

/** Ereignis an Nutzer:innen senden (fire-and-forget; Fehler werden protokolliert, nicht geworfen). */
export async function publish(userIds: string[], e: LiveEvent) {
  const u = [...new Set(userIds)].filter(Boolean);
  if (!u.length) return;
  for (const payload of chunkPayloads(u, e)) {
    try {
      // $executeRaw: pg_notify liefert void – $queryRaw kann diese Spalte nicht deserialisieren
      await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;
    } catch (err) {
      // Echtzeit ist ein Komfort – Polling fängt es auf; trotzdem sichtbar machen (ohne IDs/PII)
      console.warn(JSON.stringify({ level: "warn", msg: "realtime_publish_failed", event: e.t, bytes: Buffer.byteLength(payload), err: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) }));
    }
  }
}

/** Auf Ereignisse einer Person hören. Gibt eine Abmeldefunktion zurück. */
export async function subscribe(userId: string, onEvent: (e: LiveEvent) => void, onReset: () => void) {
  await connect();
  state.emitter.on(userId, onEvent);
  state.emitter.on("__reset", onReset);
  return () => {
    state.emitter.off(userId, onEvent);
    state.emitter.off("__reset", onReset);
  };
}
