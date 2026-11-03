"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, SendHorizontal, X } from "lucide-react";
import { uploadFile } from "@/components/media/uploader";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Attachment = { key: string; id: string | null; preview: string; progress: number; error?: boolean };

export type ComposerHandle = { focus: () => void };

/**
 * Nachrichten-Composer: Enter sendet, Umschalt+Enter für Zeilenumbruch,
 * bis zu 6 Bilder. Bleibt nach dem Senden fokussiert.
 */
export const MessageComposer = forwardRef<ComposerHandle, { onSend: (body: string, media: { id: string; alt: string }[]) => Promise<boolean>; disabled?: boolean; disabledReason?: string; placeholder?: string; autoFocus?: boolean }>(
  function MessageComposer({ onSend, disabled, disabledReason, placeholder = "Nachricht schreiben …", autoFocus }, ref) {
    const [body, setBody] = useState("");
    const [files, setFiles] = useState<Attachment[]>([]);
    const [sending, setSending] = useState(false);
    const area = useRef<HTMLTextAreaElement>(null);
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

    const uploading = files.some((f) => !f.id && !f.error);
    const ready = files.filter((f) => f.id);
    const canSend = !disabled && !sending && !uploading && (body.trim().length > 0 || ready.length > 0);

    async function add(list: FileList | null) {
      if (!list) return;
      for (const file of Array.from(list).slice(0, 6 - files.length)) {
        if (!file.type.startsWith("image/")) {
          toast("In Nachrichten kannst du nur Bilder senden.", "error");
          continue;
        }
        const key = crypto.randomUUID();
        setFiles((p) => [...p, { key, id: null, preview: URL.createObjectURL(file), progress: 0 }]);
        try {
          const r = await uploadFile(file, "public", (progress) => setFiles((p) => p.map((f) => (f.key === key ? { ...f, progress } : f))));
          setFiles((p) => p.map((f) => (f.key === key ? { ...f, id: r.mediaId, progress: 1, preview: r.variants?.sm ?? f.preview } : f)));
        } catch (e) {
          toast(e instanceof Error ? e.message : "Upload fehlgeschlagen", "error");
          setFiles((p) => p.map((f) => (f.key === key ? { ...f, error: true } : f)));
        }
      }
    }

    async function send() {
      if (!canSend) return;
      setSending(true);
      const ok = await onSend(body.trim(), ready.map((f) => ({ id: f.id!, alt: "" })));
      setSending(false);
      if (ok) {
        setBody("");
        setFiles([]);
      }
      requestAnimationFrame(() => area.current?.focus());
    }

    if (disabled && disabledReason) {
      return <p className="border-t border-line bg-sunken px-4 py-4 text-center text-sm text-muted" role="status">{disabledReason}</p>;
    }

    return (
      <div className="border-t border-ink bg-paper px-3 py-3 sm:px-4">
        {files.length > 0 && (
          <ul className="mb-2 flex gap-2 overflow-x-auto" aria-label="Angehängte Bilder">
            {files.map((f, i) => (
              <li key={f.key} className="relative size-16 shrink-0 overflow-hidden border border-line bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="" className={cn("h-full w-full object-cover", !f.id && "opacity-60")} />
                {!f.id && !f.error && <LoaderCircle size={16} className="absolute inset-0 m-auto animate-spin text-ink" />}
                {f.error && <span className="absolute inset-0 grid place-items-center bg-danger/80 text-[10px] font-semibold text-paper">Fehler</span>}
                <button type="button" onClick={() => setFiles((p) => p.filter((x) => x.key !== f.key))} className="absolute right-0 top-0 grid size-5 place-items-center bg-card" aria-label={`Bild ${i + 1} entfernen`}>
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={files.length >= 6 || disabled} className="grid size-10 shrink-0 place-items-center text-muted hover:bg-sunken hover:text-ink disabled:opacity-40" aria-label="Bild anhängen">
            <ImagePlus size={19} strokeWidth={1.7} />
          </button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/avif" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          <label htmlFor="msg-body" className="sr-only">Nachricht</label>
          <textarea
            id="msg-body"
            ref={area}
            value={body}
            autoFocus={autoFocus}
            disabled={disabled}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={5000}
            placeholder={placeholder}
            aria-describedby="msg-hint"
            className="max-h-40 min-h-10 flex-1 resize-none border border-line-strong bg-card px-3 py-2 text-[15px] leading-relaxed outline-none field-sizing-content focus:border-ink"
          />
          <button type="button" onClick={() => void send()} disabled={!canSend} className="grid size-10 shrink-0 place-items-center bg-ink text-paper hover:bg-ink-2 disabled:opacity-35" aria-label="Senden">
            {sending ? <LoaderCircle size={17} className="animate-spin" /> : <SendHorizontal size={17} />}
          </button>
        </div>
        <p id="msg-hint" className="mt-1.5 hidden pl-12 text-[11px] text-muted sm:block">Enter zum Senden · Umschalt+Enter für neue Zeile</p>
      </div>
    );
  },
);
