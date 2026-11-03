"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, ArrowLeft, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadedMedia = { id: string; alt: string; preview: string; state: "uploading" | "ready" | "error"; progress: number; kind: "IMAGE" | "VIDEO" | "FILE" };

/** Upload-Ablauf: Anmelden → direkt in Bucket PUT → Abschluss melden (§25.6). */
export async function uploadFile(file: File, purpose: "public" | "private" = "public", onProgress?: (p: number) => void) {
  const res = await fetch("/api/v1/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: file.type || "application/octet-stream", bytes: file.size, purpose }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Upload nicht möglich");
  const { mediaId, uploadUrl, fallbackUrl, headers } = json.data as { mediaId: string; uploadUrl: string; fallbackUrl?: string; headers: Record<string, string> };
  const put = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(Object.assign(new Error("Upload fehlgeschlagen"), { status: xhr.status })));
      xhr.onerror = () => reject(Object.assign(new Error("Netzwerkfehler beim Upload"), { status: 0 }));
      xhr.send(file);
    });
  try {
    await put(uploadUrl);
  } catch (err) {
    // Direkt-Upload in den Bucket gescheitert (Netzwerk/CORS/Proxy) → über den eigenen Server
    if (!fallbackUrl || fallbackUrl === uploadUrl) throw err;
    onProgress?.(0);
    await put(fallbackUrl);
  }
  const done = await fetch(`/api/v1/media/${mediaId}/complete`, { method: "POST" });
  const dj = await done.json();
  if (!done.ok) throw new Error(dj.error?.message ?? "Verarbeitung fehlgeschlagen");
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

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    const list = Array.from(files).slice(0, Math.max(0, max - value.length));
    for (const file of list) {
      const tmpId = `tmp-${crypto.randomUUID()}`;
      const kind = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
      const preview = URL.createObjectURL(file);
      onChange((prev) => [...prev, { id: tmpId, alt: "", preview, state: "uploading", progress: 0, kind }]);
      try {
        const r = await uploadFile(file, "public", (p) => onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, progress: p } : m))));
        onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, id: r.mediaId, state: "ready", progress: 1, preview: r.variants?.sm ?? preview } : m)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
        onChange((prev) => prev.map((m) => (m.id === tmpId ? { ...m, state: "error" } : m)));
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
            <li key={m.id} className="group border border-line bg-card">
              <div className="relative aspect-square overflow-hidden bg-sunken">
                {m.kind === "VIDEO" ? (
                  <video src={m.preview} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.preview} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-1.5 top-1.5 bg-ink px-1.5 font-mono text-[10px] text-paper">{String(i + 1).padStart(2, "0")}</span>
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
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" onClick={() => move(i, -1)} className="grid size-7 place-items-center bg-card" aria-label="Nach vorne">
                    <ArrowLeft size={14} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="grid size-7 place-items-center bg-card" aria-label="Nach hinten">
                    <ArrowRight size={14} />
                  </button>
                  <button type="button" onClick={() => onChange((prev) => prev.filter((x) => x.id !== m.id))} className="grid size-7 place-items-center bg-card" aria-label="Entfernen">
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
            "flex w-full items-center justify-center gap-2 border border-dashed border-line-strong text-sm text-muted transition-colors hover:border-ink hover:text-ink",
            compact ? "h-11" : "h-24",
          )}
        >
          <ImagePlus size={18} />
          {compact ? "Medien" : "Fotos oder Video hinzufügen – oder hierher ziehen"}
        </button>
      )}
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => add(e.target.files)} />
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
