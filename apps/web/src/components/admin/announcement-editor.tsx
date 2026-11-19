"use client";

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CTA_MAX,
  ANNOUNCEMENT_PLACEMENTS,
  ANNOUNCEMENT_PLACEMENT_LABEL,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TONES,
  ANNOUNCEMENT_TONE_KEYS,
  type AnnouncementPlacement,
  type AnnouncementTone,
} from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, Input } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { EMOJI_FONT, EmojiPicker } from "@/components/ui/emoji-picker";
import { AnnouncementCard } from "@/components/announcements/announcement-banner";
import { cn } from "@/lib/utils";
import { saveAnnouncementAction } from "@/app/admin/ankuendigungen/actions";

export type AnnouncementEditorValues = {
  title: string;
  body: string;
  emoji: string;
  tone: AnnouncementTone;
  ctaLabel: string;
  ctaHref: string;
  placements: AnnouncementPlacement[];
  /** ISO-Zeitpunkt oder leer */
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
  isActive: boolean;
  position: number;
};

/** ISO → Wert für <input type="datetime-local"> in der Ortszeit des Browsers */
function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full text-[15px] font-semibold text-ink">{title}</legend>
      {hint && <p className="clear-left mb-4 text-[13px] text-muted">{hint}</p>}
      <div className={cn("clear-left space-y-4", !hint && "pt-3")}>{children}</div>
    </fieldset>
  );
}

export function AnnouncementEditor({ id, initial }: { id: string | null; initial: AnnouncementEditorValues }) {
  const [v, setV] = useState({ ...initial, startsAt: toLocalInput(initial.startsAt), endsAt: toLocalInput(initial.endsAt) });
  const titleRef = useRef<HTMLInputElement>(null);
  const { run, pending, fields: serverFields, error } = useAction(saveAnnouncementAction, {
    redirect: (d) => (id ? undefined : `/admin/ankuendigungen/${d.id}`),
  });
  /** Felder, die seit dem letzten Speichern geändert wurden – deren alte Fehlermeldung verschwindet */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const fields = Object.fromEntries(Object.entries(serverFields).filter(([k]) => !edited.has(k)));
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setEdited((e) => (e.has(k) ? e : new Set(e).add(k)));
  };

  function insertIntoTitle(emoji: string) {
    const el = titleRef.current;
    const start = el?.selectionStart ?? v.title.length;
    const end = el?.selectionEnd ?? v.title.length;
    const next = (v.title.slice(0, start) + emoji + v.title.slice(end)).slice(0, ANNOUNCEMENT_TITLE_MAX);
    set("title", next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el?.setSelectionRange(pos, pos);
    });
  }

  function togglePlacement(p: AnnouncementPlacement) {
    set("placements", v.placements.includes(p) ? v.placements.filter((x) => x !== p) : ANNOUNCEMENT_PLACEMENTS.filter((x) => x === p || v.placements.includes(x)));
  }

  const tone = ANNOUNCEMENT_TONES[v.tone];
  const titleCount = [...v.title].length;

  return (
    <form
      noValidate
      className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]"
      onSubmit={(e) => {
        e.preventDefault();
        setEdited(new Set());
        run(id, {
          title: v.title,
          body: v.body,
          emoji: v.emoji,
          tone: v.tone,
          ctaLabel: v.ctaLabel,
          ctaHref: v.ctaHref,
          placements: v.placements,
          startsAt: fromLocalInput(v.startsAt),
          endsAt: fromLocalInput(v.endsAt),
          dismissible: v.dismissible,
          isActive: v.isActive,
          position: v.position,
        });
      }}
    >
      <div className="min-w-0 space-y-8">
        <Section title="Inhalt">
          <Field label="Titel" error={fields.title} hint={`${titleCount}/${ANNOUNCEMENT_TITLE_MAX} Zeichen · kurz und konkret, z. B. „Wartung am Sonntag ab 22 Uhr“`}>
            {(p) => (
              <div className="flex items-center gap-1.5">
                <Input ref={titleRef} {...p} value={v.title} maxLength={ANNOUNCEMENT_TITLE_MAX} onChange={(e) => set("title", e.target.value)} autoComplete="off" />
                <EmojiPicker onPick={insertIntoTitle} label="Emoji in den Titel einfügen" align="end" className="shrink-0" />
              </div>
            )}
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink">
              Symbol <span className="ml-1.5 font-normal text-muted">optional</span>
            </p>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-12 place-items-center rounded-2xl text-[28px] leading-none" style={{ background: tone.bg, color: tone.fg, fontFamily: EMOJI_FONT }}>
                {v.emoji || <span className="text-[13px] font-semibold opacity-70">–</span>}
              </span>
              <span className="flex items-center gap-1 rounded-xl border border-line px-1 py-1">
                <EmojiPicker onPick={(e) => set("emoji", e)} label={v.emoji ? "Symbol ändern" : "Symbol wählen"} />
                {v.emoji && (
                  <button type="button" onClick={() => set("emoji", "")} aria-label="Symbol entfernen" title="Symbol entfernen" className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink">
                    <X size={16} aria-hidden />
                  </button>
                )}
              </span>
              <span className="text-[13px] text-muted">Steht gross links neben dem Titel.</span>
            </div>
            <FieldError>{fields.emoji}</FieldError>
          </div>

          <Field label="Information" optional error={fields.body} hint="Fett, kursiv, Listen, Links und Emojis über die Werkzeugleiste.">
            {(p) => <RichTextEditor {...p} value={v.body} onChange={(b) => set("body", b)} maxLength={ANNOUNCEMENT_BODY_MAX} placeholder="Was ist los, und was sollen die Leute wissen?" emoji minHeight={140} />}
          </Field>
        </Section>

        <Section title="Hintergrund" hint="Farben aus der Werkuno-Palette. Die Schrift passt sich automatisch an und bleibt lesbar.">
          <div role="radiogroup" aria-label="Hintergrundfarbe" className="flex flex-wrap gap-2.5">
            {ANNOUNCEMENT_TONE_KEYS.map((k) => {
              const t = ANNOUNCEMENT_TONES[k];
              const on = v.tone === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("tone", k)}
                  className={cn("group flex flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-ink")}
                >
                  <span
                    className={cn("grid size-12 place-items-center rounded-xl border text-[15px] font-bold transition-[box-shadow]", on ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : "border-line group-hover:border-line-strong")}
                    style={{ background: t.bg, color: t.fg }}
                  >
                    {on ? <Check size={18} strokeWidth={2.6} aria-hidden /> : "Aa"}
                  </span>
                  <span className={cn("text-[12px]", on ? "font-semibold text-ink" : "text-muted")}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Button" hint="Optional. Beides ausfüllen oder beides leer lassen.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="Beschriftung" error={fields.ctaLabel}>
              {(p) => <Input {...p} value={v.ctaLabel} maxLength={ANNOUNCEMENT_CTA_MAX} placeholder="Mehr erfahren" onChange={(e) => set("ctaLabel", e.target.value)} />}
            </Field>
            <Field label="Link-Adresse" error={fields.ctaHref} hint="Interne Seite wie /markt oder eine https://-Adresse">
              {(p) => <Input {...p} value={v.ctaHref} inputMode="url" placeholder="/markt" onChange={(e) => set("ctaHref", e.target.value)} spellCheck={false} />}
            </Field>
          </div>
        </Section>

        <Section title="Wo erscheint sie?">
          <div className="grid gap-3 sm:grid-cols-2">
            {ANNOUNCEMENT_PLACEMENTS.map((p) => (
              <Checkbox
                key={p}
                checked={v.placements.includes(p)}
                onChange={() => togglePlacement(p)}
                className="rounded-xl border border-line p-3"
                label={
                  <span>
                    <span className="block font-semibold">{ANNOUNCEMENT_PLACEMENT_LABEL[p].label}</span>
                    <span className="text-[13px] text-muted">{ANNOUNCEMENT_PLACEMENT_LABEL[p].hint}</span>
                  </span>
                }
              />
            ))}
          </div>
          <FieldError>{fields.placements}</FieldError>
        </Section>

        <Section title="Zeitraum" hint="Leer lassen = sofort und ohne Ende. Zeiten in deiner Ortszeit.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ab" optional error={fields.startsAt}>
              {(p) => <Input {...p} type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}
            </Field>
            <Field label="Bis" optional error={fields.endsAt}>
              {(p) => <Input {...p} type="datetime-local" value={v.endsAt} min={v.startsAt || undefined} onChange={(e) => set("endsAt", e.target.value)} />}
            </Field>
          </div>
        </Section>

        <Section title="Verhalten">
          <Checkbox checked={v.dismissible} onChange={(e) => set("dismissible", e.target.checked)} label={<span>Ausblenden erlauben <span className="block text-[13px] text-muted">Mit dem ✕ verschwindet sie für diesen Browser, bis du sie änderst.</span></span>} />
          <Field label="Reihenfolge" error={fields.position} hint="Kleinere Zahl zuerst, wenn mehrere gleichzeitig laufen." className="max-w-40">
            {(p) => <Input {...p} type="number" min={0} max={999} value={v.position} onChange={(e) => set("position", Math.max(0, Math.min(999, Number(e.target.value) || 0)))} />}
          </Field>
          <Checkbox checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} label={<span className="font-semibold">Aktiv <span className="block font-normal text-[13px] text-muted">Ohne Haken bleibt sie ein Entwurf und ist nirgends sichtbar.</span></span>} />
        </Section>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button type="submit" variant="ink" disabled={pending}>
            {pending ? "Speichert …" : id ? "Änderungen speichern" : "Ankündigung anlegen"}
          </Button>
          {error && Object.keys(fields).length > 0 && (
            <p role="alert" className="text-[13px] font-medium text-danger">
              Bitte prüfe die markierten Felder.
            </p>
          )}
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start" aria-label="Vorschau">
        <p className="spec mb-2">Vorschau</p>
        <AnnouncementCard
          a={{
            title: v.title.trim() || "Titel der Ankündigung",
            body: v.body,
            emoji: v.emoji,
            tone: v.tone,
            ctaLabel: v.ctaLabel.trim(),
            ctaHref: v.ctaHref.trim(),
            dismissible: v.dismissible,
          }}
          onDismiss={() => {}}
        />
        <p className="mt-3 text-[13px] text-muted">
          So erscheint sie oben auf {v.placements.length ? v.placements.map((p) => ANNOUNCEMENT_PLACEMENT_LABEL[p].label).join(", ") : "– noch keiner Seite –"}.
          {!v.isActive && " Zurzeit Entwurf."}
        </p>
      </aside>
    </form>
  );
}
