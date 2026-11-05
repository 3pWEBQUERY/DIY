"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { CATEGORIES, COMMUNITY_VISIBILITY, COMMUNITY_VISIBILITY_LABEL, listCategories } from "@werkraum/shared";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type Rule = { key: number; title: string; body: string };

export type CommunityEditInitial = {
  id: string;
  name: string;
  description: string;
  category: string;
  visibility: (typeof COMMUNITY_VISIBILITY)[number];
  region: string | null;
  rules: { title: string; body: string }[];
};

/**
 * Stammdaten einer Community im Dialog bearbeiten (Plattform-Moderation).
 * Zugangsänderungen sind der Administration vorbehalten; die Begründung landet
 * im Audit-Protokoll, die optionale Nachricht geht an die Community-Leitung.
 */
export function CommunityEditButton({
  initial,
  canChangeVisibility,
  action,
}: {
  initial: CommunityEditInitial;
  canChangeVisibility: boolean;
  action: (id: string, input: Record<string, unknown>) => Promise<ActionResult<{ changed: string[] }>>;
}) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [seq, setSeq] = useState(0);
  const { run, pending, fields } = useAction(action, {
    success: (d) => (d.changed.length ? "Angaben gespeichert. Die Leitung wurde informiert." : "Keine Änderungen."),
    onSuccess: () => setOpen(false),
  });

  function openDialog() {
    setRules(initial.rules.map((r, i) => ({ key: i, title: r.title, body: r.body })));
    setSeq(initial.rules.length);
    setOpen(true);
  }

  function move(i: number, dir: -1 | 1) {
    setRules((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  const update = (key: number, patch: Partial<Rule>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const generalError = fields._ ?? fields.rules;

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Pencil size={14} aria-hidden /> Bearbeiten
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Community bearbeiten" description="Änderungen werden sofort wirksam und im Moderationsprotokoll der Community vermerkt." wide>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(initial.id, {
              name: String(fd.get("name") ?? ""),
              description: String(fd.get("description") ?? ""),
              category: String(fd.get("category") ?? ""),
              visibility: canChangeVisibility ? String(fd.get("visibility") ?? initial.visibility) : initial.visibility,
              region: String(fd.get("region") ?? ""),
              rules: rules.map((r) => ({ title: r.title, body: r.body })),
              reason: String(fd.get("reason") ?? ""),
              publicNote: String(fd.get("publicNote") ?? ""),
            });
          }}
        >
          <Field label="Name" error={fields.name}>
            {(p) => <Input name="name" defaultValue={initial.name} required minLength={3} maxLength={80} {...p} />}
          </Field>
          <Field label="Beschreibung" optional error={fields.description}>
            {(p) => <Textarea name="description" defaultValue={initial.description} maxLength={4000} rows={4} {...p} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategorie" error={fields.category}>
              {(p) => (
                <Select name="category" defaultValue={initial.category} {...p}>
                  {listCategories().map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Zugang" hint={canChangeVisibility ? undefined : "Den Zugang ändert nur die Administration."} error={fields.visibility}>
              {(p) => (
                <Select name="visibility" defaultValue={initial.visibility} disabled={!canChangeVisibility} {...p}>
                  {COMMUNITY_VISIBILITY.map((v) => (
                    <option key={v} value={v}>
                      {COMMUNITY_VISIBILITY_LABEL[v]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Region" optional error={fields.region}>
            {(p) => <Input name="region" defaultValue={initial.region ?? ""} maxLength={80} placeholder="z.B. Zürich" {...p} />}
          </Field>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-[13px] font-semibold text-ink">
                Regeln <span className="ml-1 font-normal text-muted">{rules.length} / 20</span>
              </legend>
              <Button
                size="sm"
                variant="ghost"
                disabled={rules.length >= 20}
                onClick={() => {
                  setRules((rs) => [...rs, { key: seq, title: "", body: "" }]);
                  setSeq((s) => s + 1);
                }}
              >
                <Plus size={14} aria-hidden /> Regel
              </Button>
            </div>
            {rules.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong px-4 py-4 text-center text-[13px] text-muted">Keine Regeln hinterlegt.</p>}
            <ol className="space-y-3">
              {rules.map((r, i) => (
                <li key={r.key} className="rounded-2xl border border-line bg-paper/40 p-3">
                  <div className="flex items-start gap-2">
                    <span className="spec mt-3 w-5 shrink-0 text-right">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Field label={`Titel Regel ${i + 1}`} error={fields[`rules.${i}.title`]}>
                        {(p) => <Input value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} required minLength={2} maxLength={120} className="h-10" {...p} />}
                      </Field>
                      <Field label="Erläuterung" optional error={fields[`rules.${i}.body`]}>
                        {(p) => <Textarea value={r.body} onChange={(e) => update(r.key, { body: e.target.value })} maxLength={1000} rows={2} className="min-h-16" {...p} />}
                      </Field>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 pt-6">
                      <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Regel ${i + 1} nach oben`}>
                        <ArrowUp size={14} aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label={`Regel ${i + 1} nach unten`}>
                        <ArrowDown size={14} aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8 text-danger" onClick={() => setRules((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Regel ${i + 1} entfernen`}>
                        <Trash2 size={14} aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </fieldset>

          <div className="space-y-4 border-t border-line pt-5">
            <Field label="Interne Begründung" hint="Wird im Audit-Protokoll gespeichert – nicht für die Community sichtbar." error={fields.reason ?? generalError}>
              {(p) => <Textarea name="reason" required minLength={5} maxLength={1000} rows={2} {...p} />}
            </Field>
            <Field label="Nachricht an die Leitung" optional hint="Erscheint in der Benachrichtigung an die Gründerin / den Gründer." error={fields.publicNote}>
              {(p) => <Textarea name="publicNote" maxLength={1000} rows={2} {...p} />}
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
              {pending ? "Wird gespeichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
