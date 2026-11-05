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

/** Ereignis an Nutzer:innen senden (fire-and-forget, Fehler werden geschluckt). */
export async function publish(userIds: string[], e: LiveEvent) {
  const u = [...new Set(userIds)].filter(Boolean);
  if (!u.length) return;
  try {
    await db.$queryRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify({ u, e } satisfies Payload)})`;
  } catch {
    /* Echtzeit ist ein Komfort – Polling fängt es auf */
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
