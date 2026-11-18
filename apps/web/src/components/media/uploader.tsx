"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X, ArrowLeft, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { backoffDelay, isTransientStatus } from "@/lib/backoff";

export type UploadedMedia = { id: string; alt: string; preview: string; state: "uploading" | "ready" | "error"; progress: number; kind: "IMAGE" | "VIDEO" | "FILE" };

/** Länge eines Videos im Browser lesen (null, wenn der Browser das Format nicht kennt, z. B. HEVC). */
function videoDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    v.src = url;
  });
}

/** Verständliche Meldung je HTTP-Status, falls der Server kein (gültiges) JSON liefert (Proxy-Fehlerseite, 502, 413 …). */
function statusMessage(status: number, fallback: string) {
  if (status === 401) return "Bitte melde dich erneut an.";
  if (status === 403) return "Dafür fehlt dir die Berechtigung.";
  if (status === 413) return "Die Datei ist zu gross.";
  if (status === 415) return "Dieses Dateiformat wird nicht unterstützt.";
  if (status === 429) return "Zu viele Uploads in kurzer Zeit. Bitte warte einen Moment.";
  if (status >= 500 || status === 0) return "Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.";
  return fallback;
}

type ApiBody = { data?: unknown; error?: { message?: string } } | null;
/** Antwort sicher lesen: kaputtes/fehlendes JSON wirft nicht, sondern liefert null. */
async function readJson(res: Response): Promise<ApiBody> {
  return (await res.json().catch(() => null)) as ApiBody;
}

/** Fehler, der beim Abbrechen (Entfernen/Aushängen) geworfen wird – nicht als Fehlermeldung anzeigen. */
export function isAbortError(e: unknown) {
  return e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string } | null)?.name === "AbortError";
}
const abortError = () => new DOMException("Upload abgebrochen", "AbortError");

/** Dateityp gegen ein `accept`-Attribut prüfen (MIME, Wildcards wie image/*, Endungen wie .pdf). */
export function matchesAccept(file: File, accept?: string) {
  if (!accept?.trim()) return true;
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}

/** Upload-Ablauf: Anmelden → direkt in Bucket PUT → Abschluss melden (§25.6). Mit `signal` abbrechbar. */
export async function uploadFile(file: File, purpose: "public" | "private" = "public", onProgress?: (p: number) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  const durationSec = file.type.startsWith("video/") ? await videoDuration(file) : null;
  const res = await fetch("/api/v1/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: file.type || "application/octet-stream", bytes: file.size, purpose, durationSec }),
    signal,
  });
  const json = await readJson(res);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? statusMessage(res.status, "Upload nicht möglich."));
  const { mediaId, uploadUrl, fallbackUrl, headers } = json.data as { mediaId: string; uploadUrl: string; fallbackUrl?: string; headers: Record<string, string> };
  const put = (url: string) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      xhr.open("PUT", url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        cleanup();
        if (xhr.status < 300) resolve();
        else reject(Object.assign(new Error(statusMessage(xhr.status, "Upload fehlgeschlagen.")), { status: xhr.status }));
      };
      xhr.onerror = () => {
        cleanup();
        reject(Object.assign(new Error("Netzwerkfehler beim Upload."), { status: 0 }));
      };
      xhr.onabort = () => {
        cleanup();
        reject(abortError());
      };
      xhr.send(file);
    });
  try {
    await put(uploadUrl);
  } catch (err) {
    // Direkt-Upload in den Bucket gescheitert (Netzwerk/CORS/Proxy) → über den eigenen Server
    if (isAbortError(err) || !fallbackUrl || fallbackUrl === uploadUrl) throw err;
    onProgress?.(0);
    await put(fallbackUrl);
  }
  const done = await fetch(`/api/v1/media/${mediaId}/complete`, { method: "POST", signal });
  const dj = await readJson(done);
  if (!done.ok || !dj?.data) throw new Error(dj?.error?.message ?? statusMessage(done.status, "Verarbeitung fehlgeschlagen."));
  return { mediaId, ...(dj.data as { state: string; variants: Record<string, string> }) };
}

/**
 * Mehrfach-Upload mit Reihenfolge, Vorschau und Alt-Text je Bild (§9.3, §29.4).
 */
export function MediaPicker({
  value,
  onChange,
  max = 10,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/avif,video/mp4,video/quicktime,video/webm",
  compact,
}: {
  value: UploadedMedia[];
  onChange: (next: UploadedMedia[] | ((prev: UploadedMedia[]) => UploadedMedia[])) => void;
  max?: number;
  accept?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Lokale Vorschauen (Object URLs): url → schon in `value` gesehen? Freigeben, sobald sie nicht mehr
  // angezeigt werden (ersetzt durch Server-Vorschau, entfernt, nach dem Senden geleert) bzw. beim Aushängen.
  const blobs = useRef(new Map<string, boolean>());
  // Hintergrund-Abfragen (Videoverarbeitung) beim Aushängen beenden
  const abort = useRef<AbortController | null>(null);
  // Laufende Uploads je Eintrag – beim Entfernen bzw. Aushängen abbrechen
  const uploads = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const map = blobs.current;
    const running = uploads.current;
    return () => {
      ctrl.abort();
      running.forEach((c) => c.abort());
      running.clear();
      map.forEach((_, url) => URL.revokeObjectURL(url));
      map.clear();
    };
  }, []);
  useEffect(() => {
    const shown = new Set(value.map((m) => m.preview));
    blobs.current.forEach((seen, url) => {
      if (shown.has(url)) blobs.current.set(url, true);
      else if (seen) {
        URL.revokeObjectURL(url);
        blobs.current.delete(url);
      }
    });
  }, [value]);

  async function add(files: FileList | File[] | null) {
    if (!files) return;
    setError(null);
    const all = Array.from(files);
    // Beim Hineinziehen greift `accept` nicht – selbst filtern und Abgelehntes melden
    const allowed = all.filter((f) => matchesAccept(f, accept));
    const rejected = all.length - allowed.length;
    const room = Math.max(0, max - value.length);
    const list = allowed.slice(0, room);
    const notes: string[] = [];
    if (rejected) notes.push(rejected === 1 ? "1 Datei hat ein nicht unterstütztes Format und wurde übersprungen." : `${rejected} Dateien haben ein nicht unterstütztes Format und wurden übersprungen.`);
    if (allowed.length > room) notes.push(`Höchstens ${max} Dateien – ${allowed.length - room} wurden nicht hinzugefügt.`);
    if (notes.length) setError(notes.join(" "));
    for (const file of list) {
      if (abort.current?.signal.aborted) return;
      const tmpId = `tmp-${crypto.randomUUID()}`;
      const kind = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
      const preview = URL.createObjectURL(file);
      blobs.current.set(preview, false);
      const ctrl = new AbortController();
      uploads.current.set(tmpId, ctrl);
      onChange((prev) => [...prev, { id: tmpId, alt: "", preview, state: "uploading", progress: 0, kind }]);
      try {
        const r = await uploadFile(file, "public", (p) => onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, progress: p } : m))), ctrl.signal);
        onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, id: r.mediaId, state: "ready", progress: 1, preview: r.variants?.sm ?? preview } : m)));
        if (kind === "VIDEO") void watchVideo(r.mediaId, abort.current?.signal);
      } catch (e) {
        if (abort.current?.signal.aborted) return;
        // Vom Nutzer entfernt → Eintrag ist schon weg, keine Fehlermeldung
        if (isAbortError(e) || ctrl.signal.aborted) continue;
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
        onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, state: "error" } : m)));
      } finally {
        uploads.current.delete(tmpId);
      }
    }
  }

  function remove(id: string) {
    uploads.current.get(id)?.abort();
    uploads.current.delete(id);
    onChange((prev) => prev.filter((x) => x.id !== id));
  }

  /** Videos werden im Hintergrund umgewandelt – eine Ablehnung (z. B. zu lang) sofort anzeigen. */
  async function watchVideo(mediaId: string, signal?: AbortSignal) {
    // Netzwerkfehler/Serverfehler (z. B. kurz offline, Deploy) beenden die Abfrage nicht mehr:
    // mit wachsendem Abstand erneut versuchen; nur echte 4xx-Antworten (gelöscht, kein Zugriff) beenden sie.
    let failures = 0;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, failures > 0 ? backoffDelay(failures - 1) : i < 10 ? 1500 : 4000));
      if (!signal || signal.aborted) return;
      const res = await fetch(`/api/v1/media/${mediaId}/status`, { cache: "no-store", signal }).catch(() => null);
      if (signal.aborted) return;
      if (!res?.ok) {
        if (!isTransientStatus(res?.status) || ++failures > 8) return;
        continue;
      }
      const body = (await res.json().catch(() => null)) as { data?: { state: string; error: string | null; variants: Record<string, string> } } | null;
      if (!body?.data) {
        if (++failures > 8) return;
        continue;
      }
      failures = 0;
      const { data } = body;
      if (data.state === "READY") return;
      if (data.state === "FAILED") {
        setError(data.error ?? "Das Video konnte nicht verarbeitet werden.");
        onChange((prev) => prev.map((m) => (m.id === mediaId ? { ...m, state: "error" } : m)));
        return;
      }
    }
  }

  function move(i: number, dir: -1 | 1) {
    onChange((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  return (
    <div>
      {value.length > 0 && (
        <ol className={cn("mb-3 grid gap-3", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
          {value.map((m, i) => (
            <li key={m.id} className="group border border-line bg-card rounded-2xl">
              <div className="relative aspect-square overflow-hidden bg-sunken">
                {m.kind === "VIDEO" ? (
                  <video src={m.preview} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.preview} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-1.5 top-1.5 bg-ink px-1.5 font-mono text-[10px] text-paper rounded-2xl">{String(i + 1).padStart(2, "0")}</span>
                {m.state === "uploading" && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-line">
                    <span className="block h-full bg-moss transition-[width]" style={{ width: `${Math.round(m.progress * 100)}%` }} />
                  </span>
                )}
                {m.state === "uploading" && <Loader2 size={18} className="absolute right-2 top-2 animate-spin text-paper" />}
                {m.state === "error" && (
                  <span className="absolute inset-0 grid place-items-center bg-danger/80 text-paper">
                    <AlertCircle />
                  </span>
                )}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                  <button type="button" onClick={() => move(i, -1)} className="grid size-7 place-items-center bg-card" aria-label="Nach vorne">
                    <ArrowLeft size={14} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="grid size-7 place-items-center bg-card" aria-label="Nach hinten">
                    <ArrowRight size={14} />
                  </button>
                  <button type="button" onClick={() => remove(m.id)} className="grid size-7 place-items-center bg-card" aria-label="Entfernen">
                    <X size={14} />
                  </button>
                </div>
              </div>
              {!compact && m.kind === "IMAGE" && (
                <input
                  value={m.alt}
                  onChange={(e) => onChange((prev) => prev.map((x) => (x.id === m.id ? { ...x, alt: e.target.value } : x)))}
                  placeholder="Bildbeschreibung (Alt-Text)"
                  aria-label={`Bildbeschreibung für Bild ${i + 1}`}
                  className="h-9 w-full border-t border-line px-2 text-[12px] outline-none focus:bg-sunken"
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full items-center justify-center gap-2 border border-dashed border-line-strong text-sm text-muted transition-colors hover:border-rule-strong hover:text-ink rounded-2xl",
            compact ? "h-11" : "h-24",
          )}
        >
          <ImagePlus size={18} />
          {compact ? "Medien" : "Fotos oder Video hinzufügen – oder hierher ziehen"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Zurücksetzen, damit dieselbe Datei nach Entfernen/Fehler erneut gewählt werden kann
          e.target.value = "";
          void add(files);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
