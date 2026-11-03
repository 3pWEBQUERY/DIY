"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Pencil, Plus, Trash2, X } from "lucide-react";
import { VISIBILITY, VISIBILITY_LABEL, type Visibility } from "@werkraum/shared";
import type { TargetType } from "@/generated/prisma/enums";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createCollectionAction, deleteCollectionAction, moveBookmarkAction, removeBookmarkAction, updateCollectionAction } from "@/app/(app)/gespeichert/actions";

type Collection = { id: string; title: string; description: string; visibility: Visibility };

function CollectionForm({ initial, onDone }: { initial?: Collection; onDone: (id?: string) => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "PRIVATE");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const input = { title, description, visibility };
          const r = initial ? await updateCollectionAction(initial.id, input) : await createCollectionAction(input);
          if (r.ok) {
            toast(r.message ?? "Gespeichert.");
            onDone(r.data && "id" in r.data ? r.data.id : initial?.id);
          } else {
            setFields(r.fields ?? {});
            if (!r.fields) toast(r.error, "error");
          }
        });
      }}
    >
      <Field label="Titel" error={fields.title}>
        {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus placeholder="z. B. Ideen fürs Wohnzimmer" />}
      </Field>
      <Field label="Beschreibung" optional error={fields.description}>
        {(a) => <Textarea {...a} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />}
      </Field>
      <Field label="Sichtbarkeit" hint={visibility === "PUBLIC" ? "Jede Person mit dem Link und dein Profil zeigen diese Sammlung." : visibility === "FOLLOWERS" ? "Nur Menschen, die dir folgen." : "Nur du."}>
        {(a) => (
          <Select {...a} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITY.map((v) => (
              <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={pending || !title.trim()}>{initial ? "Speichern" : "Sammlung anlegen"}</Button>
    </form>
  );
}

export function NewCollectionButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink", className)}>
        <Plus size={14} /> Neue Sammlung
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Neue Sammlung" description="Sammlungen ordnen dein Gespeichertes – privat oder öffentlich.">
        <CollectionForm
          onDone={(id) => {
            setOpen(false);
            router.push(id ? `/gespeichert?sammlung=${id}` : "/gespeichert");
            router.refresh();
          }}
        />
      </Dialog>
    </>
  );
}

export function EditCollectionButtons({ collection }: { collection: Collection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil size={14} /> Bearbeiten
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Sammlung löschen"
        onClick={() =>
          confirm(`Sammlung «${collection.title}» löschen? Die Inhalte bleiben unter «Gespeichert».`) &&
          start(async () => {
            const r = await deleteCollectionAction(collection.id);
            if (r.ok) {
              toast(r.message ?? "Gelöscht.");
              router.push("/gespeichert");
              router.refresh();
            } else toast(r.error, "error");
          })
        }
      >
        <Trash2 size={14} />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sammlung bearbeiten">
        <CollectionForm
          initial={collection}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Dialog>
    </div>
  );
}

/** Lesezeichen in Sammlung verschieben bzw. entfernen. */
export function SavedItemControls({ type, id, collectionId, collections, className }: { type: TargetType; id: string; collectionId: string | null; collections: { id: string; title: string }[]; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(collectionId ?? "");
  const [pending, start] = useTransition();
  return (
    <div className={cn("mt-2 flex items-center gap-1", className)}>
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">In Sammlung verschieben</span>
        <FolderInput size={13} className="pointer-events-none absolute left-2 text-muted" />
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            const prev = value;
            setValue(next);
            start(async () => {
              const r = await moveBookmarkAction(type, id, next || null);
              if (r.ok) {
                toast(r.message ?? "Verschoben.");
                router.refresh();
              } else {
                setValue(prev);
                toast(r.error, "error");
              }
            });
          }}
          className="h-8 w-full min-w-0 truncate border border-line bg-card pl-7 pr-2 text-[12px] text-ink-2 hover:border-line-strong"
        >
          <option value="">Ohne Sammlung</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending}
        aria-label="Nicht mehr speichern"
        onClick={() =>
          start(async () => {
            const r = await removeBookmarkAction(type, id);
            if (r.ok) {
              toast(r.message ?? "Entfernt.");
              router.refresh();
            } else toast(r.error, "error");
          })
        }
        className="grid size-8 shrink-0 place-items-center text-muted hover:text-danger"
      >
        <X size={14} />
      </button>
    </div>
  );
}
