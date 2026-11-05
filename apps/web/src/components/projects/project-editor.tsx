"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork, ListPlus } from "lucide-react";
import {
  CATEGORIES,
  DIFFICULTY,
  DIFFICULTY_LABEL,
  PROJECT_STATUS,
  PROJECT_STATUS_LABEL,
  VISIBILITY,
  VISIBILITY_LABEL,
  type ProjectStatus,
  type Visibility,
} from "@werkraum/shared";
import type { ProjectEditData, RemixSource } from "@/server/projects/service";
import type { CategoryOption } from "@/server/categories/types";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Difficulty, Notice, SectionTitle } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { LineEditor, newLine, type Line } from "@/components/materials/line-editor";
import { cn, formatMinutes } from "@/lib/utils";
import { createProjectAction, updateProjectAction } from "@/app/(app)/projekte/actions";
import { StatusMark } from "./status";

type Values = ProjectEditData["values"];

/** Minuten als Stunden + Minuten erfassen. */
export function DurationInput({ id, value, onChange, describedBy, invalid }: { id: string; value: number | null; onChange: (v: number | null) => void; describedBy?: string; invalid?: boolean }) {
  const h = value != null ? Math.floor(value / 60) : "";
  const m = value != null ? value % 60 : "";
  const set = (hh: string, mm: string) => {
    if (hh === "" && mm === "") return onChange(null);
    onChange(Math.max(0, (Number(hh) || 0) * 60 + (Number(mm) || 0)));
  };
  return (
    <div className="flex items-center gap-2" aria-describedby={describedBy}>
      <div className="relative flex-1">
        <Input id={id} type="number" inputMode="numeric" min={0} max={1600} value={h} onChange={(e) => set(e.target.value, String(m))} aria-invalid={invalid || undefined} className="pr-12" aria-label="Stunden" />
        <span className="spec pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">Std.</span>
      </div>
      <div className="relative flex-1">
        <Input type="number" inputMode="numeric" min={0} max={59} value={m} onChange={(e) => set(String(h), e.target.value)} className="pr-12" aria-label="Minuten" />
        <span className="spec pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">Min.</span>
      </div>
    </div>
  );
}

function toLines(xs: { name: string; quantity: string; note: string; materialId?: string }[] | undefined) {
  return (xs ?? []).map((x) => newLine(x));
}

/**
 * Projekt-Editor (PRD §10.2) für Neuanlage, Bearbeitung und Nachbau.
 * Nachbau: nur Verweis aufs Original + optional übernehmbare Materialliste (keine Texte/Dateien).
 */
export function ProjectEditor({
  mode,
  projectId,
  initial,
  remixSource,
  remixOf,
  defaultCategory,
  categories = CATEGORIES,
}: {
  mode: "create" | "edit";
  projectId?: string;
  initial?: Values;
  remixSource?: RemixSource | null;
  remixOf?: ProjectEditData["remixOf"];
  defaultCategory?: string;
  /** Angebotene Kategorien (aktive + ggf. bereits gespeicherte); Standard: alle */
  categories?: readonly CategoryOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(initial?.title ?? (remixSource ? `Mein Nachbau: ${remixSource.title}`.slice(0, 120) : ""));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? remixSource?.category ?? defaultCategory ?? "");
  const [tagText, setTagText] = useState((initial?.tags ?? []).join(", "));
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? (remixSource ? "PLANNING" : "IN_PROGRESS"));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "PUBLIC");
  const [difficulty, setDifficulty] = useState<number>(initial?.difficulty ?? remixSource?.difficulty ?? 2);
  const [estimated, setEstimated] = useState<number | null>(initial?.estimatedMinutes ?? null);
  const [actual, setActual] = useState<number | null>(initial?.actualMinutes ?? null);
  const [budget, setBudget] = useState(initial?.budgetMinor != null ? (initial.budgetMinor / 100).toFixed(2) : "");
  const [media, setMedia] = useState<UploadedMedia[]>(
    (initial?.media ?? []).map((m) => ({ id: m.id, alt: m.alt, preview: m.preview, state: "ready", progress: 1, kind: m.kind })),
  );
  const [coverId, setCoverId] = useState<string | null>(initial?.coverMediaId ?? null);
  const [materials, setMaterials] = useState<Line[]>(toLines(initial?.materials));
  const [tools, setTools] = useState<Line[]>(toLines(initial?.tools));
  const [remixNote, setRemixNote] = useState(initial?.remixNote ?? "");
  const [copied, setCopied] = useState(false);

  const tags = useMemo(
    () => [...new Set(tagText.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
    [tagText],
  );
  const readyImages = media.filter((m) => m.state === "ready" && m.kind === "IMAGE");
  const effectiveCover = readyImages.find((m) => m.id === coverId)?.id ?? readyImages[0]?.id ?? null;
  const uploading = media.some((m) => m.state === "uploading");
  const isRemix = !!remixSource || !!remixOf;

  const copyMaterials = () => {
    if (!remixSource) return;
    const have = new Set(materials.map((m) => m.name.trim().toLowerCase()));
    setMaterials([...materials.filter((m) => m.name.trim()), ...toLines(remixSource.materials).filter((m) => !have.has(m.name.toLowerCase()))]);
    const haveT = new Set(tools.map((m) => m.name.trim().toLowerCase()));
    setTools([...tools.filter((m) => m.name.trim()), ...toLines(remixSource.tools).filter((m) => !haveT.has(m.name.toLowerCase()))]);
    setCopied(true);
    toast("Materialliste übernommen – passe Mengen und Abweichungen an.");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const budgetMinor = budget.trim() ? Math.round(Number(budget.replace(/[^\d.,]/g, "").replace(",", ".")) * 100) : undefined;
    if (budgetMinor != null && !Number.isFinite(budgetMinor)) {
      setFields({ budgetMinor: "Bitte gib einen Betrag an, z. B. 45.50" });
      return;
    }
    const payload = {
      title,
      description,
      category,
      tags,
      status,
      visibility,
      difficulty,
      estimatedMinutes: estimated ?? undefined,
      actualMinutes: actual ?? undefined,
      budgetMinor,
      coverMediaId: effectiveCover ?? undefined,
      media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
      materials: materials.filter((m) => m.name.trim()).map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId })),
      tools: tools.filter((m) => m.name.trim()).map((m) => ({ name: m.name, quantity: m.quantity, note: m.note })),
      remixOfId: remixSource?.id,
      remixNote: isRemix ? remixNote : undefined,
    };
    start(async () => {
      const r = mode === "edit" && projectId ? await updateProjectAction(projectId, payload) : await createProjectAction(payload);
      if (r.ok) {
        toast(mode === "edit" ? "Änderungen gespeichert." : isRemix ? "Nachbau angelegt – viel Freude beim Bauen!" : "Projekt angelegt.");
        router.push(r.data.href);
        router.refresh();
      } else {
        setFields(r.fields ?? {});
        toast(r.error, "error");
      }
    });
  };

  let n = 0;
  const no = () => String(++n).padStart(2, "0");

  return (
    <form onSubmit={submit} className="space-y-14" noValidate>
      {remixSource && (
        <div className="flex items-start gap-4 border border-clay bg-clay-soft px-5 py-4 rounded-2xl">
          <GitFork size={18} className="mt-0.5 shrink-0 text-clay-ink" />
          <div className="min-w-0 flex-1">
            <p className="spec text-clay-ink">Nachbau</p>
            <p className="mt-0.5 text-[15px]">
              Du baust{" "}
              <Link href={remixSource.href} className="font-semibold underline underline-offset-2" target="_blank">
                «{remixSource.title}»
              </Link>{" "}
              von {remixSource.ownerName} nach. Dein Projekt verweist auf das Original; Texte, Bilder und Dateien werden nicht kopiert.
            </p>
            {remixSource.materials.length + remixSource.tools.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyMaterials} disabled={copied}>
                <ListPlus size={14} /> {copied ? "Materialliste übernommen" : `Materialliste übernehmen (${remixSource.materials.length + remixSource.tools.length})`}
              </Button>
            )}
          </div>
        </div>
      )}
      {remixOf && (
        <Notice>
          Nachbau von <Link href={remixOf.href} className="font-semibold underline underline-offset-2">«{remixOf.title}»</Link> von {remixOf.ownerName}.
        </Notice>
      )}

      {/* 01 Grunddaten */}
      <section className="space-y-5">
        <SectionTitle n={no()} title="Grunddaten" />
        <Field label="Titel" error={fields.title}>
          {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="z. B. Hocker aus Eschenholz" className="h-12 font-serif text-xl" />}
        </Field>
        <Field label="Beschreibung" optional hint="Idee, Motivation, Besonderheiten. Fortschritte trägst du später im Journal ein." error={fields.description}>
          {(a) => <Textarea {...a} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} rows={7} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Kategorie" error={fields.category}>
            {(a) => (
              <Select {...a} value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="" disabled>
                  Bitte wählen
                </option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Schlagwörter" optional hint={tags.length ? tags.map((t) => `#${t}`).join("  ") : "Mit Komma trennen, max. 12"} error={fields.tags}>
            {(a) => <Input {...a} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="eschenholz, zapfenverbindung" />}
          </Field>
        </div>
      </section>

      {/* 02 Galerie */}
      <section className="space-y-4">
        <SectionTitle n={no()} title="Galerie" action={<span className="spec">{media.length}/30</span>} />
        <MediaPicker value={media} onChange={setMedia} max={30} />
        {readyImages.length > 1 && (
          <fieldset>
            <legend className="spec mb-2">Titelbild</legend>
            <div className="flex flex-wrap gap-2">
              {readyImages.map((m, i) => (
                <label key={m.id} className={cn("relative size-16 cursor-pointer overflow-hidden border rounded-2xl", effectiveCover === m.id ? "border-moss outline outline-2 outline-moss" : "border-line opacity-70 hover:opacity-100")}>
                  <input type="radio" name="cover" className="sr-only" checked={effectiveCover === m.id} onChange={() => setCoverId(m.id)} aria-label={`Bild ${i + 1} als Titelbild`} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.preview} alt="" className="h-full w-full object-cover" />
                  {effectiveCover === m.id && <span className="absolute inset-x-0 bottom-0 bg-ink py-0.5 text-center font-mono text-[9px] uppercase text-paper rounded-2xl">Titel</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {fields.media && <p className="text-[13px] text-danger">{fields.media}</p>}
      </section>

      {/* 03 Datenblatt */}
      <section className="space-y-6">
        <SectionTitle n={no()} title="Datenblatt" />
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">Status</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PROJECT_STATUS.map((s) => (
              <label key={s} className={cn("flex cursor-pointer items-center gap-2.5 border px-3 py-2.5 text-sm rounded-2xl", status === s ? "border-moss bg-moss-soft/60 font-semibold text-moss-ink" : "border-line hover:border-line-strong")}>
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                <StatusMark status={s} />
                {PROJECT_STATUS_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">Schwierigkeit</legend>
          <div className="grid grid-cols-5 overflow-hidden rounded-2xl border border-line-strong">
            {DIFFICULTY.map((d) => (
              <label key={d} className={cn("flex cursor-pointer flex-col items-center gap-2 border-r border-line px-1 py-3 text-center last:border-r-0", difficulty === d ? "bg-moss text-paper" : "hover:bg-moss-soft")}>
                <input type="radio" name="difficulty" value={d} checked={difficulty === d} onChange={() => setDifficulty(d)} className="sr-only" />
                <Difficulty level={d} className={difficulty === d ? "[&>span]:bg-paper [&>span.bg-line-strong]:bg-paper/30" : ""} />
                <span className="text-[12px] leading-tight">{DIFFICULTY_LABEL[d]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Geschätzte Zeit" optional hint={estimated ? formatMinutes(estimated) : undefined} error={fields.estimatedMinutes}>
            {(a) => <DurationInput id={a.id} value={estimated} onChange={setEstimated} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} />}
          </Field>
          <Field label="Tatsächliche Zeit" optional hint={actual ? formatMinutes(actual) : "Leer lassen: Summe aus dem Journal"} error={fields.actualMinutes}>
            {(a) => <DurationInput id={a.id} value={actual} onChange={setActual} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} />}
          </Field>
          <Field label="Budget" optional hint="Materialkosten in CHF" error={fields.budgetMinor}>
            {(a) => (
              <div className="relative">
                <span className="spec pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">CHF</span>
                <Input {...a} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" className="pl-12 num" />
              </div>
            )}
          </Field>
        </div>
        <Field label="Sichtbarkeit" error={fields.visibility}>
          {(a) => (
            <Select {...a} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              {VISIBILITY.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </section>

      {/* 04 Material & Werkzeug */}
      <section className="space-y-8">
        <SectionTitle n={no()} title="Material & Werkzeug" action={<span className="spec">{materials.length + tools.length} Positionen</span>} />
        <div>
          <p className="spec mb-3 text-ink">Material</p>
          <LineEditor kind="material" value={materials} onChange={setMaterials} errors={fields} errorPrefix="materials" />
        </div>
        <div>
          <p className="spec mb-3 text-ink">Werkzeug</p>
          <LineEditor kind="tool" value={tools} onChange={setTools} errors={fields} errorPrefix="tools" />
        </div>
      </section>

      {/* 05 Nachbau */}
      {isRemix && (
        <section className="space-y-4">
          <SectionTitle n={no()} title="Abweichungen zum Original" />
          <Field label="Was machst du anders?" optional hint="Andere Masse, Materialien, Techniken – das hilft allen, die später nachbauen." error={fields.remixNote}>
            {(a) => <Textarea {...a} value={remixNote} onChange={(e) => setRemixNote(e.target.value)} maxLength={2000} rows={4} className="border-l-2 border-l-clay" />}
          </Field>
        </section>
      )}

      <div className="sticky bottom-[4.75rem] z-20 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card/95 px-4 py-3 shadow-float backdrop-blur md:bottom-4">
        <span className="hidden text-[13px] text-muted sm:block">
          {mode === "edit" ? "Änderungen sind nach dem Speichern sofort sichtbar." : "Du kannst alles später ergänzen – auch Journal und Anleitung."}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={pending || uploading}>
            {uploading ? "Lädt hoch …" : pending ? "Speichert …" : mode === "edit" ? "Speichern" : isRemix ? "Nachbau anlegen" : "Projekt anlegen"}
          </Button>
        </div>
      </div>
    </form>
  );
}
