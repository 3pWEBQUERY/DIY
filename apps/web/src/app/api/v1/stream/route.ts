import { currentUser } from "@/server/auth/session";
import { flagEnabled } from "@/server/flags";
import { subscribe, type LiveEvent } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events für Live-Updates (neue Nachrichten, Zähler).
 * Der Browser hält genau eine Verbindung pro Tab; bei Abbruch verbindet EventSource neu.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // Live-Updates abgeschaltet: 204 beendet EventSource ohne Neuverbindung, Zähler laufen per Abfrage weiter
  if (!(await flagEnabled("realtime", user.id))) return new Response(null, { status: 204 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n: verbunden\n\n");
      let unsub = () => {};
      try {
        unsub = await subscribe(
          user.id,
          (e: LiveEvent) => send(`event: ${e.t}\ndata: ${JSON.stringify(e)}\n\n`),
          () => {
            cleanup();
            try {
              controller.close();
            } catch {}
          },
        );
      } catch {
        controller.close();
        return;
      }
      // Herzschlag hält Proxys (Railway, CDN) offen
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
