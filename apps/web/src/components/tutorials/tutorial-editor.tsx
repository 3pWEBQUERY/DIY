"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, Plus, Trash2 } from "lucide-react";
import { CATEGORIES, DIFFICULTY, DIFFICULTY_LABEL, SAFETY_KINDS, SAFETY_LABEL, type SafetyKind } from "@werkraum/shared";
import type { TutorialEditData } from "@/server/tutorials/service";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Difficulty, SectionTitle } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { LineEditor, newLine, type Line } from "@/components/materials/line-editor";
import { DurationInput } from "@/components/projects/project-editor";
import { cn, formatMinutes, pad } from "@/lib/utils";
import { saveTutorialAction } from "@/app/(app)/anleitungen/actions";

type Values = TutorialEditData["values"];

type StepState = {
  uid: string;
  stableKey?: string;
  title: string;
  body: string;
  minutes: string;
  tip: string;
  safety: string;
  safetyKinds: SafetyKind[];
  media: UploadedMedia[];
  materials: string[];
  tools: string[];
  open: boolean;
};

const emptyStep = (open = true): StepState => ({ uid: crypto.randomUUID(), title: "", body: "", minutes: "", tip: "", safety: "", safetyKinds: [], media: [], materials: [], tools: [], open });

function fromValues(v?: Values): StepState[] {
  if (!v?.steps.length) return [emptyStep()];
  return v.steps.map((s, i) => ({
    uid: crypto.randomUUID(),
    stableKey: s.stableKey,
    title: s.title,
    body: s.body,
    minutes: s.minutes != null ? String(s.minutes) : "",
    tip: s.tip,
    safety: s.safety,
    safetyKinds: s.safetyKinds,
    media: s.media.map((m) => ({ id: m.id, alt: m.alt, preview: m.preview, state: "ready" as const, progress: 1, kind: "IMAGE" as const })),
    materials: s.materials,
    tools: s.tools,
    open: i === 0,
  }));
}

/**
 * Anleitungs-Editor (PRD §11): Metadaten, Material/Werkzeug, sortierbare Schritte mit allen Feldern.
 * „Entwurf speichern“ ändert nur die Arbeitskopie; „Neue Version veröffentlichen“ friert sie als Version n+1 ein.
 */
export function TutorialEditor({
  tutorialId,
  initial,
  currentVersion,
  projects,
  defaultProjectId,
  slug,
}: {
  tutorialId: string | null;
  initial?: Values;
  currentVersion: number | null;
  projects: { id: string; title: string }[];
  defaultProjectId?: string;
  slug?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 2);
  const [minutes, setMinutes] = useState<number | null>(initial?.minutes ?? null);
  const [projectId, setProjectId] = useState(initial?.projectId ?? defaultProjectId ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "de-CH");
  const [cover, setCover] = useState<UploadedMedia[]>(initial?.cover ? [{ id: initial.cover.id, alt: initial.cover.alt, preview: initial.cover.preview, state: "ready", progress: 1, kind: "IMAGE" }] : []);
  const [materials, setMaterials] = useState<Line[]>((initial?.materials ?? []).map((m) => newLine(m)));
  const [tools, setTools] = useState<Line[]>((initial?.tools ?? []).map((m) => newLine(m)));
  const [steps, setSteps] = useState<StepState[]>(() => fromValues(initial));

  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [isMajor, setIsMajor] = useState(false);
  const [notifyReaders, setNotifyReaders] = useState(true);
  const [shareToFeed, setShareToFeed] = useState(currentVersion == null);

  // Ungespeicherte Änderungen: Vergleich mit dem zuletzt gespeicherten Stand
  const serialized = JSON.stringify({
    title, summary, category, difficulty, minutes, projectId, language,
    cover: cover.map((c) => [c.id, c.state]),
    materials, tools,
    steps: steps.map((x) => ({ ...x, open: undefined, media: x.media.map((m) => [m.id, m.alt, m.state]) })),
  });
  const [savedState, setSavedState] = useState(serialized);
  const dirty = savedState !== serialized;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const uploading = cover.some((m) => m.state === "uploading") || steps.some((s) => s.media.some((m) => m.state === "uploading"));
  const stepMinutes = steps.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const aggregatedSafety = useMemo(() => SAFETY_KINDS.filter((k) => steps.some((s) => s.safetyKinds.includes(k))), [steps]);
  const materialNames = materials.map((m) => m.name.trim()).filter(Boolean);
  const toolNames = tools.map((m) => m.name.trim()).filter(Boolean);

  const patchStep = (uid: string, patch: Partial<StepState>) => setSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  const moveStep = (i: number, d: -1 | 1) =>
    setSteps((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const payload = () => ({
    title,
    summary,
    category,
    difficulty,
    minutes: minutes ?? undefined,
    projectId: projectId || undefined,
    coverMediaId: cover.find((c) => c.state === "ready")?.id,
    language,
    materials: materials.filter((m) => m.name.trim()).map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId })),
    tools: tools.filter((m) => m.name.trim()).map((m) => ({ name: m.name, quantity: m.quantity, note: m.note })),
    steps: steps.map((s) => ({
      stableKey: s.stableKey,
      title: s.title,
      body: s.body,
      minutes: s.minutes ? Number(s.minutes) : undefined,
      tip: s.tip.trim() || undefined,
      safety: s.safety.trim() || undefined,
      safetyKinds: s.safetyKinds,
      media: s.media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
      materials: s.materials,
      tools: s.tools,
    })),
    changeNote: changeNote.trim() || undefined,
    isMajor,
    notifyReaders: isMajor && notifyReaders,
    shareToFeed,
  });

  const save = (publish: boolean) =>
    start(async () => {
      const r = await saveTutorialAction(tutorialId, payload(), publish);
      if (r.ok) {
        setFields({});
        setSavedState(serialized);
        setPublishOpen(false);
        toast(publish ? `Version ${r.data.version} veröffentlicht.` : "Entwurf gespeichert.");
        if (publish) router.push(r.data.href);
        else if (!tutorialId) router.replace(`/studio/anleitungen/${r.data.id}`);
        else router.refresh();
      } else {
        setFields(r.fields ?? {});
        setPublishOpen(false);
        const stepErr = Object.keys(r.fields ?? {}).find((k) => k.startsWith("steps."));
        if (stepErr) {
          const idx = Number(stepErr.split(".")[1]);
          setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, open: true } : s)));
        }
        toast(r.error, "error");
      }
    });

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-14">
        {/* 01 Metadaten */}
        <section className="space-y-5">
          <SectionTitle n="01" title="Über die Anleitung" />
          <Field label="Titel" error={fields.title}>
            {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="z. B. Hocker mit Zapfenverbindung bauen" className="h-12 font-serif text-xl" />}
          </Field>
          <Field label="Kurzbeschreibung" optional hint="Was entsteht, für wen eignet sich die Anleitung?" error={fields.summary}>
            {(a) => <Textarea {...a} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} rows={3} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Kategorie" error={fields.category}>
              {(a) => (
                <Select {...a} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="" disabled>Bitte wählen</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Zum Projekt" optional hint="Die Anleitung erscheint im Projektfaden." error={fields.projectId}>
              {(a) => (
                <Select {...a} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Kein Projekt</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">Schwierigkeit</legend>
            <div className="grid grid-cols-5 border border-line-strong">
              {DIFFICULTY.map((d) => (
                <label key={d} className={cn("flex cursor-pointer flex-col items-center gap-2 border-r border-line px-1 py-3 text-center last:border-r-0", difficulty === d ? "bg-ink text-paper" : "hover:bg-sunken")}>
                  <input type="radio" name="t-difficulty" value={d} checked={difficulty === d} onChange={() => setDifficulty(d)} className="sr-only" />
                  <Difficulty level={d} className={difficulty === d ? "[&>span]:bg-paper [&>span.bg-line-strong]:bg-paper/30" : ""} />
                  <span className="text-[12px] leading-tight">{DIFFICULTY_LABEL[d]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Gesamtdauer" optional hint={minutes ? formatMinutes(minutes) : stepMinutes ? `Leer lassen: Summe der Schritte (${formatMinutes(stepMinutes)})` : "Leer lassen: Summe der Schritte"} error={fields.minutes}>
              {(a) => <DurationInput id={a.id} value={minutes} onChange={setMinutes} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} />}
            </Field>
            <Field label="Sprache" error={fields.language}>
              {(a) => (
                <Select {...a} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="de-CH">Deutsch (Schweiz)</option>
                  <option value="de-DE">Deutsch (Deutschland)</option>
                  <option value="de-AT">Deutsch (Österreich)</option>
                </Select>
              )}
            </Field>
          </div>
          <div>
            <Label>Titelbild</Label>
            <MediaPicker value={cover} onChange={setCover} max={1} accept="image/jpeg,image/png,image/webp,image/heic,image/avif" />
          </div>
          <p className="flex items-center justify-between border border-line bg-sunken px-4 py-3 text-[13px] text-muted">
            <span>Preis</span>
            <span className="font-semibold text-ink">Kostenlos</span>
          </p>
        </section>

        {/* 02 Material & Werkzeug */}
        <section className="space-y-8">
          <SectionTitle n="02" title="Material & Werkzeug" />
          <div>
            <p className="spec mb-3 text-ink">Material</p>
            <LineEditor kind="material" value={materials} onChange={setMaterials} errors={fields} errorPrefix="materials" />
          </div>
          <div>
            <p className="spec mb-3 text-ink">Werkzeug</p>
            <LineEditor kind="tool" value={tools} onChange={setTools} errors={fields} errorPrefix="tools" />
          </div>
        </section>

        {/* 03 Schritte */}
        <section className="space-y-4">
          <SectionTitle n="03" title="Schritte" action={<span className="spec">{steps.length} Schritte{stepMinutes ? ` · ${formatMinutes(stepMinutes)}` : ""}</span>} />
          {fields.steps && <p className="text-[13px] text-danger">{fields.steps}</p>}
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <StepCard
                key={s.uid}
                step={s}
                index={i}
                total={steps.length}
                errors={fields}
                materialNames={materialNames}
                toolNames={toolNames}
                onPatch={(p) => patchStep(s.uid, p)}
                onMedia={(next) => setSteps((prev) => prev.map((x) => (x.uid === s.uid ? { ...x, media: typeof next === "function" ? next(x.media) : next } : x)))}
                onMove={(d) => moveStep(i, d)}
                onDuplicate={() => setSteps((prev) => [...prev.slice(0, i + 1), { ...s, uid: crypto.randomUUID(), stableKey: undefined, title: `${s.title} (Kopie)`.slice(0, 140), media: [], open: true }, ...prev.slice(i + 1)])}
                onRemove={() => steps.length > 1 && confirm(`Schritt ${i + 1} entfernen?`) && setSteps((prev) => prev.filter((x) => x.uid !== s.uid))}
              />
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev.map((x) => ({ ...x, open: false })), emptyStep()])}
            disabled={steps.length >= 80}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-line-strong text-sm font-semibold text-muted hover:border-ink hover:text-ink"
          >
            <Plus size={16} /> Schritt {pad(steps.length + 1)} hinzufügen
          </button>
        </section>
      </div>

      {/* Seitenleiste: Status & Veröffentlichen */}
      <aside className="xl:sticky xl:top-24 xl:h-fit">
        <div className="border border-ink bg-card">
          <div className="border-b border-line px-4 py-3">
            <p className="spec text-ink">Stand</p>
            <p className="mt-1 text-[15px] font-semibold">{currentVersion ? `Veröffentlicht · v${currentVersion}` : "Noch nicht veröffentlicht"}</p>
            <p className="mt-0.5 text-[12px] text-muted">{dirty ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</p>
          </div>
          <dl className="grid grid-cols-2 border-b border-line text-[13px]">
            <div className="px-4 py-2.5">
              <dt className="spec">Schritte</dt>
              <dd className="font-semibold num">{steps.length}</dd>
            </div>
            <div className="border-l border-line px-4 py-2.5">
              <dt className="spec">Dauer</dt>
              <dd className="font-semibold num">{formatMinutes(minutes ?? (stepMinutes || null))}</dd>
            </div>
          </dl>
          <div className="border-b border-line px-4 py-3">
            <p className="spec">Sicherheit</p>
            <p className={cn("mt-1 text-[13px]", aggregatedSafety.length ? "text-danger" : "text-muted")}>{aggregatedSafety.length ? aggregatedSafety.map((k) => SAFETY_LABEL[k]).join(" · ") : "Keine Kategorien markiert"}</p>
          </div>
          <div className="space-y-2 p-4">
            <Button className="w-full" onClick={() => setPublishOpen(true)} disabled={pending || uploading}>
              {currentVersion ? `Version ${currentVersion + 1} veröffentlichen` : "Veröffentlichen"}
            </Button>
            <Button className="w-full" variant="outline" onClick={() => save(false)} disabled={pending || uploading}>
              {uploading ? "Lädt hoch …" : pending ? "Speichert …" : "Entwurf speichern"}
            </Button>
            {tutorialId && slug && (
              <Link href={`/anleitungen/${slug}`} className="flex h-9 items-center justify-center gap-1.5 text-[13px] text-muted hover:text-ink">
                <Eye size={14} /> {currentVersion ? "Veröffentlichte Fassung ansehen" : "Vorschau"}
              </Link>
            )}
          </div>
          <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
            Titel, Beschreibung und Cover gelten sofort. Schritte und Materialien werden erst mit einer neuen Version sichtbar – veröffentlichte Versionen bleiben eingefroren.
          </p>
        </div>
      </aside>

      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title={currentVersion ? `Version ${currentVersion + 1} veröffentlichen` : "Anleitung veröffentlichen"} description="Die aktuelle Fassung wird eingefroren. Fortschritte der Lesenden bleiben erhalten.">
        <div className="space-y-4">
          <Field label="Was hat sich geändert?" optional={!currentVersion} hint={currentVersion ? "Erscheint in der Versionsgeschichte und im Hinweis für Lesende." : undefined}>
            {(a) => <Textarea {...a} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={500} rows={3} placeholder={currentVersion ? "z. B. Schritt 4 präzisiert, neue Bilder" : "Erstveröffentlichung"} />}
          </Field>
          {currentVersion != null && (
            <>
              <Checkbox label={<span><span className="font-semibold">Wesentliche Änderung</span> – z. B. andere Masse, Materialien oder Sicherheitshinweise</span>} checked={isMajor} onChange={(e) => setIsMajor(e.target.checked)} />
              {isMajor && <Checkbox label="Alle benachrichtigen, die diese Anleitung begonnen haben" checked={notifyReaders} onChange={(e) => setNotifyReaders(e.target.checked)} className="pl-7" />}
            </>
          )}
          <Checkbox label="Im Feed ankündigen" checked={shareToFeed} onChange={(e) => setShareToFeed(e.target.checked)} />
          <Button className="w-full" onClick={() => save(true)} disabled={pending || uploading}>
            {pending ? "Veröffentlicht …" : "Jetzt veröffentlichen"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function StepCard({
  step: s,
  index: i,
  total,
  errors,
  materialNames,
  toolNames,
  onPatch,
  onMedia,
  onMove,
  onDuplicate,
  onRemove,
}: {
  step: StepState;
  index: number;
  total: number;
  errors: Record<string, string>;
  materialNames: string[];
  toolNames: string[];
  onPatch: (p: Partial<StepState>) => void;
  onMedia: (next: UploadedMedia[] | ((prev: UploadedMedia[]) => UploadedMedia[])) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const err = (k: string) => errors[`steps.${i}.${k}`];
  const id = `step-${s.uid}`;
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const allMaterials = [...new Set([...materialNames, ...s.materials])];
  const allTools = [...new Set([...toolNames, ...s.tools])];
  const hasError = Object.keys(errors).some((k) => k.startsWith(`steps.${i}.`));

  return (
    <li className={cn("border bg-card", s.open ? "border-ink" : hasError ? "border-danger" : "border-line")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => onPatch({ open: !s.open })}
          aria-expanded={s.open}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
        >
          <span className="display w-10 shrink-0 text-[1.7rem] leading-none num">{pad(i + 1)}</span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate font-semibold", !s.title && "text-muted")}>{s.title || "Ohne Titel"}</span>
            <span className="spec block">
              {[s.minutes && formatMinutes(Number(s.minutes)), s.media.length && `${s.media.length} Bild${s.media.length > 1 ? "er" : ""}`, s.safetyKinds.length && "Sicherheit", s.tip && "Tipp"].filter(Boolean).join(" · ") || "Leer"}
            </span>
          </span>
          <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", s.open && "rotate-180")} />
        </button>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove(-1)} disabled={i === 0} className="grid size-8 place-items-center text-muted hover:text-ink disabled:opacity-30" aria-label={`Schritt ${i + 1} nach oben`}>
            <ArrowUp size={14} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={i === total - 1} className="grid size-8 place-items-center text-muted hover:text-ink disabled:opacity-30" aria-label={`Schritt ${i + 1} nach unten`}>
            <ArrowDown size={14} />
          </button>
          <button type="button" onClick={onDuplicate} className="grid size-8 place-items-center text-muted hover:text-ink" aria-label={`Schritt ${i + 1} duplizieren`}>
            <Copy size={14} />
          </button>
          <button type="button" onClick={onRemove} disabled={total === 1} className="grid size-8 place-items-center text-muted hover:text-danger disabled:opacity-30" aria-label={`Schritt ${i + 1} entfernen`}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {s.open && (
        <div id={id} className="space-y-5 border-t border-line p-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Titel des Schritts" error={err("title")}>
              {(a) => <Input {...a} value={s.title} onChange={(e) => onPatch({ title: e.target.value })} maxLength={140} placeholder="z. B. Beine zuschneiden" />}
            </Field>
            <Field label="Dauer" optional hint="Minuten" error={err("minutes")}>
              {(a) => <Input {...a} type="number" inputMode="numeric" min={0} max={10000} value={s.minutes} onChange={(e) => onPatch({ minutes: e.target.value })} />}
            </Field>
          </div>
          <Field label="Beschreibung" optional error={err("body")}>
            {(a) => <Textarea {...a} value={s.body} onChange={(e) => onPatch({ body: e.target.value })} maxLength={8000} rows={6} className="font-serif text-[16px]" />}
          </Field>
          <div>
            <span className="spec mb-2 block">Bilder · {s.media.length}/6</span>
            <MediaPicker value={s.media} onChange={onMedia} max={6} compact accept="image/jpeg,image/png,image/webp,image/heic,image/avif" />
            {s.media.some((m) => m.state === "ready") && (
              <div className="mt-2 space-y-1.5">
                {s.media.map((m, mi) =>
                  m.state === "ready" ? (
                    <input
                      key={m.id}
                      value={m.alt}
                      onChange={(e) => onMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, alt: e.target.value } : x)))}
                      maxLength={500}
                      placeholder={`Bildbeschreibung Abb. ${i + 1}.${mi + 1}`}
                      aria-label={`Bildbeschreibung für Bild ${mi + 1} in Schritt ${i + 1}`}
                      className="h-9 w-full border border-line px-2.5 text-[13px] outline-none focus:border-ink"
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
          {(allMaterials.length > 0 || allTools.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {allMaterials.length > 0 && (
                <fieldset>
                  <legend className="spec mb-2">Material in diesem Schritt</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {allMaterials.map((n) => (
                      <TogglePill key={n} active={s.materials.includes(n)} onClick={() => onPatch({ materials: toggleIn(s.materials, n).slice(0, 20) })}>{n}</TogglePill>
                    ))}
                  </div>
                </fieldset>
              )}
              {allTools.length > 0 && (
                <fieldset>
                  <legend className="spec mb-2">Werkzeug in diesem Schritt</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {allTools.map((n) => (
                      <TogglePill key={n} active={s.tools.includes(n)} onClick={() => onPatch({ tools: toggleIn(s.tools, n).slice(0, 20) })}>{n}</TogglePill>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
          <Field label="Tipp aus Erfahrung" optional hint="Persönliche Erfahrung – wird grün und klar als Tipp markiert." error={err("tip")}>
            {(a) => <Textarea {...a} value={s.tip} onChange={(e) => onPatch({ tip: e.target.value })} maxLength={1000} rows={2} className="border-l-2 border-l-moss" />}
          </Field>
          <div className="border border-danger/30 bg-danger-soft/50 p-4">
            <fieldset>
              <legend className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-danger">Sicherheit</legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {SAFETY_KINDS.map((k) => (
                  <Checkbox key={k} label={SAFETY_LABEL[k]} checked={s.safetyKinds.includes(k)} onChange={() => onPatch({ safetyKinds: s.safetyKinds.includes(k) ? s.safetyKinds.filter((x) => x !== k) : [...s.safetyKinds, k] })} />
                ))}
              </div>
            </fieldset>
            <Field label="Sicherheitshinweis" optional hint="Verbindliche Warnung – wird rot und direkt beim Schritt angezeigt." error={err("safety")} className="mt-4">
              {(a) => <Textarea {...a} value={s.safety} onChange={(e) => onPatch({ safety: e.target.value })} maxLength={1000} rows={2} className="border-l-2 border-l-danger" placeholder="z. B. Schutzbrille tragen, Werkstück fest einspannen" />}
            </Field>
          </div>
        </div>
      )}
    </li>
  );
}

function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("h-7 border px-2.5 text-[12px]", active ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink-2 hover:border-ink")}>
      {children}
    </button>
  );
}
