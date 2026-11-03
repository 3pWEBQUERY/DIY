"use client";

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

const STATE_LABEL: Record<string, string> = { PENDING: "Upload offen", PROCESSING: "In Verarbeitung", READY: "Bereit", FAILED: "Fehlgeschlagen" };

function Card({ m }: { m: MediaItem }) {
  const [alt, setAlt] = useState(m.alt);
  const save = useAction(updateAltAction);
  const del = useAction(deleteMediaAction);
  const dirty = alt.trim() !== m.alt;
  return (
    <li className="flex flex-col border border-line bg-card">
      <div className="relative aspect-square overflow-hidden bg-sunken">
        {m.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.preview} alt={m.alt} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-muted">{m.kind === "VIDEO" ? <Film size={28} strokeWidth={1.4} aria-hidden /> : <FileText size={28} strokeWidth={1.4} aria-hidden />}</span>
        )}
        <span className={cn("absolute left-1.5 top-1.5 px-1.5 font-mono text-[10px] uppercase", m.attached ? "bg-ink text-paper" : "bg-paper text-ink")}>{m.attached ? "Verwendet" : "Unbenutzt"}</span>
        {m.isPrivate && (
          <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center bg-paper" title="Privat (nur über signierte Links)">
            <Lock size={12} aria-label="Privat" />
          </span>
        )}
        {m.state !== "READY" && <span className={cn("absolute inset-x-0 bottom-0 px-2 py-1 text-[11px]", m.state === "FAILED" ? "bg-danger text-paper" : "bg-warn-soft text-warn")}>{STATE_LABEL[m.state] ?? m.state}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p className="spec">{[m.size, m.dims, m.created].filter(Boolean).join(" · ")}</p>
        {m.usedIn.length > 0 && <p className="text-[12px] text-ink-2">In: {m.usedIn.join(", ")}</p>}
        {m.kind === "IMAGE" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.run(m.id, alt);
            }}
            className="flex gap-1"
          >
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={500}
              placeholder="Alt-Text: Was ist zu sehen?"
              aria-label="Bildbeschreibung (Alt-Text)"
              className={cn("h-8 min-w-0 flex-1 border bg-paper px-2 text-[12px] outline-none focus:border-ink", m.alt ? "border-line" : "border-warn/50")}
            />
            {dirty && (
              <Button type="submit" size="sm" variant="ink" disabled={save.pending} className="h-8 px-2">
                OK
              </Button>
            )}
          </form>
        )}
        {!m.attached && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-auto justify-start px-1 text-danger"
            disabled={del.pending}
            onClick={() => window.confirm("Datei endgültig löschen? Das kann nicht rückgängig gemacht werden.") && del.run(m.id)}
          >
            <Trash2 size={13} aria-hidden /> Löschen
          </Button>
        )}
      </div>
    </li>
  );
}

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((m) => (
        <Card key={`${m.id}:${m.alt}`} m={m} />
      ))}
    </ul>
  );
}
