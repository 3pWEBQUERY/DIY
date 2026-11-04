"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { EDITORIAL_ITEM_LABEL, EDITORIAL_ITEM_TYPES, type EditorialItemType } from "@werkraum/shared";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";

type Item = { type: EditorialItemType; id: string; title?: string | null; live?: boolean };
type Initial = { slug: string; title: string; kicker: string; description: string; position: number; isActive: boolean; season: string; items: Item[] };

/** Editor für redaktionelle Kollektionen (Entdecken-Seite liest EditorialCollection). */
export function CollectionEditor({
  id,
  initial,
  action,
}: {
  id: string | null;
  initial: Initial;
  action: (id: string | null, input: unknown) => Promise<ActionResult<{ id: string }>>;
}) {
  const [items, setItems] = useState<Item[]>(initial.items);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [newType, setNewType] = useState<EditorialItemType>("project");
  const [newId, setNewId] = useState("");
  const { run, pending, fields } = useAction(action, { redirect: (d) => (id ? undefined : `/admin/redaktion/${d.id}`) });

  function move(i: number, d: -1 | 1) {
    setItems((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function addItem() {
    const raw = newId.trim();
    if (!raw) return;
    // Erlaubt auch das Einfügen einer kompletten ID-Liste (Komma/Zeilen)
    const ids = raw.split(/[\s,]+/).filter(Boolean);
    setItems((prev) => [...prev, ...ids.filter((x) => !prev.some((p) => p.type === newType && p.id === x)).map((x) => ({ type: newType, id: x }))]);
    setNewId("");
  }

  return (
    <form
      className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_420px]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(id, {
          slug,
          title: String(fd.get("title") ?? ""),
          kicker: String(fd.get("kicker") ?? ""),
          description: String(fd.get("description") ?? ""),
          position: Number(fd.get("position") ?? 0),
          season: String(fd.get("season") ?? ""),
          isActive: fd.get("isActive") === "on",
          items: items.map(({ type, id }) => ({ type, id })),
        });
      }}
    >
      <div className="space-y-5">
        <Field label="Titel" error={fields.title}>
          {(p) => (
            <Input
              name="title"
              defaultValue={initial.title}
              required
              maxLength={120}
              onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))}
              {...p}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kicker" optional hint="Kurzzeile über dem Titel, z.B. „Werkbank im Herbst“" error={fields.kicker}>
            {(p) => <Input name="kicker" defaultValue={initial.kicker} maxLength={60} {...p} />}
          </Field>
          <Field label="Slug" hint="Für Links und Analysen" error={fields.slug}>
            {(p) => (
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                required
                pattern="[a-z0-9-]+"
                {...p}
              />
            )}
          </Field>
        </div>
        <Field label="Beschreibung" optional error={fields.description}>
          {(p) => <Textarea name="description" defaultValue={initial.description} rows={3} maxLength={600} {...p} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Position" hint="Kleiner = weiter oben" error={fields.position}>
            {(p) => <Input name="position" type="number" min={0} max={999} defaultValue={initial.position} {...p} />}
          </Field>
          <Field label="Saison" optional hint="z.B. herbst-2026" error={fields.season}>
            {(p) => <Input name="season" defaultValue={initial.season} maxLength={40} {...p} />}
          </Field>
          <div className="flex items-end pb-3">
            <Checkbox name="isActive" defaultChecked={initial.isActive} label="Aktiv auf Entdecken" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-line pt-5">
          <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
            {pending ? "Speichert …" : "Kollektion speichern"}
          </Button>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 flex w-full items-baseline justify-between border-b border-ink pb-2 text-[15px] font-bold">
          Einträge <span className="spec">{items.length} / 48</span>
        </legend>
        {(fields.items ?? Object.entries(fields).find(([k]) => k.startsWith("items."))?.[1]) && (
          <p className="mb-2 text-[13px] text-danger" role="alert">
            {fields.items ?? Object.entries(fields).find(([k]) => k.startsWith("items."))?.[1]}
          </p>
        )}
        <ol className="divide-y divide-line">
          {items.length === 0 && <li className="py-6 text-center text-sm text-muted">Noch keine Einträge.</li>}
          {items.map((it, i) => (
            <li key={`${it.type}:${it.id}`} className="flex items-center gap-3 py-2">
              <span className="w-6 font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="spec">{EDITORIAL_ITEM_LABEL[it.type]}</span>
                <span className="block truncate text-sm">{it.title ?? <span className="font-mono text-[12px] text-muted">{it.id}</span>}</span>
                {it.title !== undefined && it.live === false && <span className="text-xs text-warn">nicht öffentlich sichtbar</span>}
              </span>
              <span className="flex shrink-0">
                <button type="button" onClick={() => move(i, -1)} className="grid size-8 place-items-center hover:bg-sunken rounded-xl" aria-label="Nach oben">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => move(i, 1)} className="grid size-8 place-items-center hover:bg-sunken rounded-xl" aria-label="Nach unten">
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => setItems((p) => p.filter((_, j) => j !== i))} className="grid size-8 place-items-center hover:bg-sunken rounded-xl" aria-label="Entfernen">
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
          <div className="w-36 shrink-0">
            <Field label="Typ">
              {(p) => (
                <Select value={newType} onChange={(e) => setNewType(e.target.value as EditorialItemType)} {...p}>
                  {EDITORIAL_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EDITORIAL_ITEM_LABEL[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label="ID">
              {(p) => (
                <Input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                  placeholder="cuid, mehrere mit Komma"
                  {...p}
                />
              )}
            </Field>
          </div>
          <Button variant="outline" onClick={addItem} aria-label="Eintrag hinzufügen" className="mb-0 h-11">
            <Plus size={16} />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">IDs findest du unter Inhalte, Communities oder im Marktplatz. Beim Speichern wird geprüft, ob alle Einträge existieren.</p>
      </fieldset>
    </form>
  );
}
