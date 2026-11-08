"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useState } from "react";
import { FileText, Film, Lock, Trash2 } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deleteMediaAction, updateAltAction } from "@/app/studio/medien/actions";

export type MediaItem = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "FILE";
  state: string;
  mime: string;
  size: string;
  dims: string | null;
  preview: string | null;
  isPrivate: boolean;
  alt: string;
  created: string;
  attached: boolean;
  usedIn: string[];
};

const STATE_LABEL: Record<string, string> = { PENDING: "Upload offen", PROCESSING: "Wird verarbeitet", READY: "Bereit", FAILED: "Fehlgeschlagen" };

function fileType(mime: string) {
  const sub = (mime.split("/")[1] ?? "").split(";")[0]!.toLowerCase();
  const map: Record<string, string> = { jpeg: "JPG", quicktime: "MOV", "svg+xml": "SVG", "vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX", plain: "TXT" };
  return map[sub] ?? (sub.length <= 5 ? sub.toUpperCase() : "Datei");
}

const pill = "inline-flex h-6 items-center gap-1.5 rounded-full bg-card/92 px-2.5 text-[11.5px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)] backdrop-blur-sm";

function Card({ m }: { m: MediaItem }) {
  const [alt, setAlt] = useState(m.alt);
  const save = useAction(updateAltAction);
  const del = useAction(deleteMediaAction);
  const dirty = alt.trim() !== m.alt;
  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-line-strong">
      <div className="relative aspect-[4/3] overflow-hidden bg-sunken">
        {m.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.preview} alt={m.alt} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-muted">{m.kind === "VIDEO" ? <Film size={28} strokeWidth={1.4} aria-hidden /> : <FileText size={28} strokeWidth={1.4} aria-hidden />}</span>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span className={pill}>
            <span className={cn("size-1.5 rounded-full", m.attached ? "bg-moss" : "bg-rule-strong")} aria-hidden />
            {m.attached ? "Verwendet" : "Unbenutzt"}
          </span>
          {m.kind === "VIDEO" && m.preview && (
            <span className={pill}>
              <Film size={12} aria-hidden /> Video
            </span>
          )}
          {m.isPrivate && (
            <span className={pill} title="Privat – nur über signierte Links abrufbar">
              <Lock size={11} aria-hidden /> Privat
            </span>
          )}
        </div>
        {!m.attached && (
          <button
            type="button"
            disabled={del.pending}
            onClick={async () => (await confirmDialog({ title: "Datei endgültig löschen?", body: "Die Datei wird aus deiner Medienbibliothek entfernt. Das kann nicht rückgängig gemacht werden.", confirmLabel: "Löschen" })) && del.run(m.id)}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-card/92 text-ink-2 shadow-[0_1px_2px_rgb(0_0_0/0.08)] backdrop-blur-sm transition-colors hover:bg-danger hover:text-paper disabled:opacity-50"
            aria-label="Datei löschen"
            title="Löschen"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
        {m.state !== "READY" && (
          <span className={cn(pill, "absolute bottom-2 left-2", m.state === "FAILED" ? "bg-danger text-paper" : "bg-warn-soft text-warn")}>{STATE_LABEL[m.state] ?? m.state}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="font-semibold text-ink">
            {fileType(m.mime)} <span className="font-normal text-muted">· {m.size}</span>
          </span>
          <span className="shrink-0 text-muted">{m.created}</span>
        </p>
        {m.dims && <p className="num mt-0.5 text-[12px] text-muted">{m.dims} px</p>}
        {m.usedIn.length > 0 && (
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-ink-2" title={m.usedIn.join(", ")}>
            <span className="text-muted">In </span>
            {m.usedIn.join(", ")}
          </p>
        )}

        {m.kind === "IMAGE" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.run(m.id, alt);
            }}
            className="mt-auto pt-3"
          >
            <label htmlFor={`alt-${m.id}`} className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-ink-2">
              Alt-Text
              {!m.alt && !dirty && <span className="rounded-full bg-warn-soft px-2 py-px text-[10.5px] font-medium text-warn">fehlt</span>}
            </label>
            <div className="flex gap-1.5">
              <input
                id={`alt-${m.id}`}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                maxLength={500}
                placeholder="Was ist zu sehen?"
                className={cn("h-9 min-w-0 flex-1 rounded-xl border bg-paper px-3 text-[13px] outline-none transition-colors focus:border-moss", m.alt || dirty ? "border-line-strong" : "border-warn/40")}
              />
              {dirty && (
                <Button type="submit" size="sm" disabled={save.pending} className="h-9 px-3">
                  Speichern
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {items.map((m) => (
        <Card key={`${m.id}:${m.alt}`} m={m} />
      ))}
    </ul>
  );
}
