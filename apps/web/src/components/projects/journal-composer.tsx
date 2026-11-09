"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addProjectUpdateAction, deleteProjectUpdateAction } from "@/app/(app)/projekte/actions";
import { callAction } from "@/lib/use-action";

/**
 * „Fortschritt eintragen“ (PRD §10.5): Text, Meilenstein, Problem → Lösung, Zeit, Bilder,
 * optional zusätzlich als Beitrag im Feed.
 */
export function JournalComposer({ projectId, entryNumber, defaultShare = true }: { projectId: string; entryNumber: number; defaultShare?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [milestone, setMilestone] = useState("");
  const [withProblem, setWithProblem] = useState(false);
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [minutes, setMinutes] = useState("");
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [share, setShare] = useState(defaultShare);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const uploading = media.some((m) => m.state === "uploading");

  const reset = () => {
    setBody("");
    setMilestone("");
    setProblem("");
    setSolution("");
    setWithProblem(false);
    setMinutes("");
    setMedia([]);
    setFields({});
    setOpen(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await callAction(() => addProjectUpdateAction(projectId, {
        body,
        milestone: milestone.trim() || undefined,
        problem: withProblem ? problem.trim() || undefined : undefined,
        solution: withProblem ? solution.trim() || undefined : undefined,
        minutes: minutes ? Number(minutes) : undefined,
        media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
        shareToFeed: share,
      }));
      if (r.ok) {
        toast(share ? "Fortschritt eingetragen und im Feed geteilt." : "Fortschritt eingetragen.");
        reset();
        router.refresh();
      } else {
        setFields(r.fields ?? {});
        if (!r.fields) toast(r.error, "error");
      }
    });
  };

  if (!open) {
    return (
      <button
        id="fortschritt"
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 border border-dashed border-line-strong bg-card px-4 py-4 text-left transition-colors hover:border-rule-strong rounded-2xl"
      >
        <span className="grid size-9 shrink-0 place-items-center border border-rule font-mono text-[11px] num rounded-xl">{String(entryNumber).padStart(2, "0")}</span>
        <span className="min-w-0">
          <span className="block font-semibold">Fortschritt eintragen</span>
          <span className="block text-[13px] text-muted">Was hast du heute geschafft? Auch Fehlversuche helfen anderen weiter.</span>
        </span>
      </button>
    );
  }

  return (
    <form id="fortschritt" onSubmit={submit} className="border border-rule bg-card animate-fade rounded-2xl" aria-label="Neuer Journaleintrag">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="spec text-ink">Eintrag {String(entryNumber).padStart(2, "0")}</span>
        <span className="spec">{new Date().toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })}</span>
      </div>
      <div className="space-y-4 p-4">
        <Field label="Was ist passiert?" error={fields.body}>
          {(a) => <Textarea {...a} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} placeholder="Heute habe ich …" autoFocus />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Meilenstein" optional hint="Zum Beispiel «Rahmen verleimt» – erscheint hervorgehoben im Projektfaden." error={fields.milestone}>
            {(a) => <Input {...a} value={milestone} onChange={(e) => setMilestone(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Arbeitszeit" optional hint="in Minuten" error={fields.minutes}>
            {(a) => <Input {...a} type="number" inputMode="numeric" min={0} max={10000} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
          </Field>
        </div>
        <Checkbox label="Problem und Lösung dokumentieren" checked={withProblem} onChange={(e) => setWithProblem(e.target.checked)} />
        {withProblem && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Problem" error={fields.problem}>
              {(a) => <Textarea {...a} value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={2000} rows={3} className="border-l-2 border-l-clay" placeholder="Was ging schief?" />}
            </Field>
            <Field label="Lösung" optional error={fields.solution}>
              {(a) => <Textarea {...a} value={solution} onChange={(e) => setSolution(e.target.value)} maxLength={2000} rows={3} className="border-l-2 border-l-moss" placeholder="Wie hast du es gelöst?" />}
            </Field>
          </div>
        )}
        <div>
          <span className="spec mb-2 block">Fotos</span>
          <MediaPicker value={media} onChange={setMedia} max={10} accept="image/jpeg,image/png,image/webp,image/heic,image/avif" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <Checkbox label="Auch als Beitrag im Feed teilen" checked={share} onChange={(e) => setShare(e.target.checked)} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={pending}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={pending || uploading || !body.trim()}>
            {uploading ? "Lädt hoch …" : pending ? "Speichert …" : "Eintragen"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function DeleteJournalEntry({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Eintrag löschen"
      className={cn("grid size-8 place-items-center text-muted hover:bg-sunken hover:text-danger rounded-xl", className)}
      onClick={async () => {
        if (!(await confirmDialog("Diesen Journaleintrag löschen? Ein geteilter Feed-Beitrag bleibt bestehen."))) return;
        start(async () => {
          const r = await callAction(() => deleteProjectUpdateAction(id));
          if (r.ok) {
            toast("Eintrag gelöscht.");
            router.refresh();
          } else toast(r.error, "error");
        });
      }}
    >
      <Trash2 size={15} />
    </button>
  );
}
