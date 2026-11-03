"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Lock, Globe, Plus, Trash2, UserCheck } from "lucide-react";
import { CATEGORIES } from "@werkraum/shared";
import { uploadFile } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { cn, pad, slugify } from "@/lib/utils";
import { createCommunityAction, setRulesAction, updateCommunityAction } from "@/app/(app)/communities/actions";

export type Rule = { title: string; body: string };
type Visibility = "PUBLIC" | "REQUEST" | "PRIVATE";

const VIS: { key: Visibility; label: string; body: string; icon: React.ReactNode }[] = [
  { key: "PUBLIC", label: "Öffentlich", body: "Alle können lesen und sofort beitreten.", icon: <Globe size={16} /> },
  { key: "REQUEST", label: "Auf Anfrage", body: "Alle können lesen. Beitritt nach Freigabe durch die Moderation.", icon: <UserCheck size={16} /> },
  { key: "PRIVATE", label: "Privat", body: "Nur Mitglieder sehen Beiträge. Beitritt per Anfrage oder Einladung.", icon: <Lock size={16} /> },
];

/** Regeleditor: nummerierte Regeln mit Titel und Erläuterung, sortierbar. */
export function RulesEditor({ value, onChange }: { value: Rule[]; onChange: (r: Rule[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div>
      <ol className="space-y-3">
        {value.map((r, i) => (
          <li key={i} className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-line pb-3">
            <span className="pt-2.5 font-mono text-xs text-muted">{pad(i + 1)}</span>
            <div className="space-y-2">
              <Input value={r.title} maxLength={120} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={`Regel ${i + 1}: Titel`} placeholder="z.B. Zeig deinen Prozess, nicht nur das Ergebnis" />
              <Textarea value={r.body} maxLength={1000} rows={2} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} aria-label={`Regel ${i + 1}: Erläuterung`} placeholder="Erläuterung (optional)" className="min-h-16" />
            </div>
            <div className="flex flex-col gap-1 pt-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-8 place-items-center hover:bg-sunken disabled:opacity-30" aria-label={`Regel ${i + 1} nach oben`}><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="grid size-8 place-items-center hover:bg-sunken disabled:opacity-30" aria-label={`Regel ${i + 1} nach unten`}><ArrowDown size={14} /></button>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid size-8 place-items-center hover:bg-danger-soft hover:text-danger" aria-label={`Regel ${i + 1} entfernen`}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
      </ol>
      {value.length < 20 && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => onChange([...value, { title: "", body: "" }])}>
          <Plus size={14} /> Regel hinzufügen
        </Button>
      )}
    </div>
  );
}

function CoverPicker({ url, onUploaded, onRemove }: { url: string | null; onUploaded: (mediaId: string, url: string) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  return (
    <div>
      {url ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Titelbild" className="aspect-[16/9] w-full border border-line object-cover" />
          <div className="mt-2 flex gap-4 text-xs">
            <button type="button" onClick={() => input.current?.click()} className="font-semibold hover:underline">Ersetzen</button>
            <button type="button" onClick={onRemove} className="text-muted hover:text-danger">Entfernen</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={progress !== null} className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 border border-dashed border-line-strong text-sm text-muted hover:border-ink hover:text-ink">
          {progress !== null ? <><LoaderCircle size={18} className="animate-spin" /><span className="font-mono text-xs">{Math.round(progress * 100)} %</span></> : <><ImagePlus size={20} strokeWidth={1.5} /> Titelbild hochladen (16:9)</>}
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/heic,image/avif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setProgress(0);
          try {
            const r = await uploadFile(f, "public", setProgress);
            onUploaded(r.mediaId, r.variants?.lg ?? r.variants?.md ?? URL.createObjectURL(f));
          } catch (err) {
            toast(err instanceof Error ? err.message : "Upload fehlgeschlagen", "error");
          } finally {
            setProgress(null);
          }
        }}
      />
    </div>
  );
}

type Initial = { id: string; name: string; slug: string; description: string; category: string; visibility: Visibility; region: string | null; coverUrl: string | null };

/** Formular zum Erstellen bzw. Bearbeiten einer Community. */
export function CommunityForm({ initial }: { initial?: Initial }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "PUBLIC");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [cover, setCover] = useState<{ url: string | null; mediaId?: string | null }>({ url: initial?.coverUrl ?? null });
  const [rules, setRules] = useState<Rule[]>(editing ? [] : [{ title: "Freundlich und konstruktiv bleiben", body: "Kritik am Werkstück, nie an der Person." }]);
  const create = useAction(createCommunityAction, { redirect: (d) => `/c/${d.slug}` });
  const update = useAction(updateCommunityAction.bind(null, initial?.id ?? ""));
  const a = editing ? update : create;
  const effectiveSlug = slugTouched ? slug : slugify(name || "", 48);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const base = { name, description, category, visibility, region: region || undefined, ...(cover.mediaId !== undefined ? { coverMediaId: cover.mediaId } : {}) };
        if (editing) void update.run(base);
        else void create.run({ ...base, slug: effectiveSlug || undefined, rules: rules.filter((r) => r.title.trim()) });
      }}
      className="space-y-10"
      noValidate
    >
      <section aria-labelledby="f-basics" className="space-y-5">
        <h2 id="f-basics" className="flex items-baseline gap-3 border-b border-ink pb-2 text-[15px] font-bold"><span className="spec text-ink">01</span>Grundlagen</h2>
        <Field label="Name" error={a.fields.name}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="z.B. Holzwerkstatt Zürich" />}
        </Field>
        {!editing && (
          <Field label="Adresse" error={a.fields.slug} hint="Kann später nicht mehr geändert werden.">
            {(p) => (
              <div className="flex items-center border border-line-strong bg-card focus-within:border-ink">
                <span className="pl-3 font-mono text-[12px] text-muted">/c/</span>
                <input
                  {...p}
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"));
                  }}
                  maxLength={48}
                  className="h-11 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[14px] outline-none"
                />
              </div>
            )}
          </Field>
        )}
        <Field label="Beschreibung" error={a.fields.description} hint="Worum geht es? Für wen ist die Community?">
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={5} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Kategorie" error={a.fields.category}>
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="" disabled>Bitte wählen</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Region" optional error={a.fields.region}>
            {(p) => <Input {...p} value={region} onChange={(e) => setRegion(e.target.value)} maxLength={80} placeholder="z.B. Bern oder Online" />}
          </Field>
        </div>
      </section>

      <section aria-labelledby="f-vis">
        <h2 id="f-vis" className="mb-4 flex items-baseline gap-3 border-b border-ink pb-2 text-[15px] font-bold"><span className="spec text-ink">02</span>Sichtbarkeit</h2>
        <fieldset>
          <legend className="sr-only">Sichtbarkeit</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {VIS.map((v) => (
              <label key={v.key} className={cn("flex cursor-pointer flex-col gap-1 border p-4", visibility === v.key ? "border-ink bg-card" : "border-line hover:border-line-strong")}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="visibility" value={v.key} checked={visibility === v.key} onChange={() => setVisibility(v.key)} className="accent-[#3D604C]" />
                  {v.icon} {v.label}
                </span>
                <span className="text-[13px] leading-snug text-muted">{v.body}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="f-cover">
        <h2 id="f-cover" className="mb-4 flex items-baseline gap-3 border-b border-ink pb-2 text-[15px] font-bold"><span className="spec text-ink">03</span>Titelbild</h2>
        <div className="max-w-md">
          <CoverPicker url={cover.url} onUploaded={(mediaId, url) => setCover({ mediaId, url })} onRemove={() => setCover({ url: null, mediaId: null })} />
        </div>
      </section>

      {!editing && (
        <section aria-labelledby="f-rules">
          <h2 id="f-rules" className="mb-4 flex items-baseline gap-3 border-b border-ink pb-2 text-[15px] font-bold"><span className="spec text-ink">04</span>Regeln</h2>
          <p className="mb-4 text-sm text-muted">Klare Regeln machen Moderation einfach. Du kannst sie jederzeit anpassen.</p>
          <RulesEditor value={rules} onChange={setRules} />
        </section>
      )}

      {a.error && Object.keys(a.fields).length > 0 && <p role="alert" className="text-sm text-danger">{a.error}</p>}
      <div className="flex justify-end border-t border-line pt-6">
        <Button type="submit" size="lg" disabled={a.pending || !name.trim() || !category}>
          {a.pending ? "Speichert …" : editing ? "Änderungen speichern" : "Community erstellen"}
        </Button>
      </div>
    </form>
  );
}

export function RulesForm({ communityId, initial }: { communityId: string; initial: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(initial);
  const save = useAction(setRulesAction.bind(null, communityId));
  return (
    <div>
      <RulesEditor value={rules} onChange={setRules} />
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{save.error}</p>}
      <div className="mt-6 flex justify-end">
        <Button onClick={() => void save.run(rules.filter((r) => r.title.trim()))} disabled={save.pending}>
          {save.pending ? "Speichert …" : "Regeln speichern"}
        </Button>
      </div>
    </div>
  );
}
