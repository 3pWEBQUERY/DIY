"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, VISIBILITY, VISIBILITY_LABEL } from "@werkraum/shared";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { createPostAction } from "@/app/(app)/social-actions";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import type { CategoryOption } from "@/server/categories/types";
import { CalendarClock, ListChecks, Users, X } from "lucide-react";
import { PeoplePicker, type Candidate } from "@/components/messages/people-picker";
import { coauthorCandidatesAction } from "@/app/(app)/social-actions";
import Link from "next/link";
import { Input } from "@/components/ui/field";
import { PollEditor, emptyPoll, pollReady, type PollDraft } from "./poll-editor";

/**
 * Beitragseditor – so einfach wie in einem modernen sozialen Netzwerk (§5.4, §9.3).
 * Text, mehrere Medien mit Reihenfolge & Alt-Text, Kategorie, optionales Projekt, Sichtbarkeit.
 */
/** „Jetzt + n Minuten“ als Wert für <input type="datetime-local"> (Ortszeit des Browsers). */
function localInputNow(plusMinutes = 0) {
  const d = new Date(Date.now() + plusMinutes * 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function Composer({
  viewer,
  projects,
  defaultProjectId,
  compact,
  onPosted,
  categories = CATEGORIES,
  openAfterPost,
}: {
  viewer: { displayName: string; avatarUrl: string | null };
  projects: { id: string; title: string }[];
  defaultProjectId?: string;
  compact?: boolean;
  onPosted?: () => void;
  /** Angebotene (aktive) Kategorien; Standard: alle */
  categories?: readonly CategoryOption[];
  /** Nach dem Veröffentlichen direkt zum neuen Beitrag wechseln (z. B. auf /erstellen) */
  openAfterPost?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [visibility, setVisibility] = useState<(typeof VISIBILITY)[number]>("PUBLIC");
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState("");
  const [coauthorsOpen, setCoauthorsOpen] = useState(false);
  const [coauthors, setCoauthors] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const openCoauthors = () => {
    setCoauthorsOpen(true);
    if (!candidates) void coauthorCandidatesAction().then((r) => setCandidates(r.ok ? r.data : []));
  };
  const [pending, start] = useTransition();
  const uploading = media.some((m) => m.state === "uploading");
  const missingAlt = media.some((m) => m.kind === "IMAGE" && m.state === "ready" && !m.alt.trim());
  const canPost = (body.trim() || media.some((m) => m.state === "ready")) && !uploading && pollReady(poll) && (!poll || !!body.trim());

  function submit(mode: "now" | "draft" | "schedule" = "now") {
    start(async () => {
      const r = await createPostAction({
        publish: mode,
        scheduledAt: mode === "schedule" && when ? new Date(when).toISOString() : undefined,
        body,
        media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
        category: category || undefined,
        projectId: projectId || undefined,
        visibility,
        poll: poll ? { options: poll.options.map((o) => o.trim()), durationHours: poll.durationHours, multiple: poll.multiple } : undefined,
        coauthors: coauthors.length ? coauthors : undefined,
      });
      if (r.ok) {
        toast(
          mode === "draft"
            ? "Als Entwurf gespeichert – nur du siehst ihn."
            : mode === "schedule"
              ? `Geplant für ${new Date(when).toLocaleString("de-CH", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`
              : "Veröffentlicht.",
        );
        setLater(false);
        setWhen("");
        setBody("");
        setMedia([]);
        setPoll(null);
        setCoauthors([]);
        setCoauthorsOpen(false);
        setOpen(!compact);
        onPosted?.();
        if (openAfterPost && r.data?.id) router.push(mode === "now" ? `/beitrag/${r.data.id}` : `/studio/inhalte/beitrag/${r.data.id}`);
        else router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <section aria-label="Neuer Beitrag" className={cn("border border-line bg-card rounded-2xl", open && "border-line-strong")}>
      <div className="flex gap-3 p-4">
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <label htmlFor="composer-body" className="sr-only">Was entsteht gerade bei dir?</label>
          <textarea
            id="composer-body"
            value={body}
            onFocus={() => setOpen(true)}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={open ? 3 : 1}
            placeholder={poll ? "Stelle deine Frage …" : "Was entsteht gerade auf deiner Werkbank?"}
            className="block w-full resize-none bg-transparent pt-2 text-[16px] leading-relaxed outline-none placeholder:text-muted field-sizing-content"
          />
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4 animate-fade">
          {poll ? (
            <div className="mb-4">
              <PollEditor value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />
            </div>
          ) : null}
          <MediaPicker value={media} onChange={setMedia} />
          <div className="mt-3 flex flex-wrap gap-2">
            {!poll && (
              <button type="button" onClick={() => setPoll(emptyPoll())} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-card px-3.5 text-[13px] font-semibold hover:border-rule-strong">
                <ListChecks size={15} aria-hidden /> Umfrage hinzufügen
              </button>
            )}
            {!coauthorsOpen && (
              <button type="button" onClick={openCoauthors} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-card px-3.5 text-[13px] font-semibold hover:border-rule-strong">
                <Users size={15} aria-hidden /> Koautor:innen{coauthors.length ? ` · ${coauthors.length}` : ""}
              </button>
            )}
          </div>
          {coauthorsOpen && (
            <div className="mt-3 rounded-2xl border border-line bg-paper p-4 animate-fade">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-[13px] text-muted">
                  <span className="font-semibold text-ink">Koautor:innen</span> – bis zu 3 Personen. Sie werden beim Veröffentlichen eingeladen und erscheinen am Beitrag, sobald sie bestätigt haben.
                </p>
                <button type="button" onClick={() => setCoauthorsOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label="Koautor:innen schliessen">
                  <X size={15} />
                </button>
              </div>
              {candidates == null ? <div className="h-11 animate-pulse rounded-xl bg-sunken" aria-busy /> : <PeoplePicker candidates={candidates} value={coauthors} onChange={setCoauthors} max={3} />}
            </div>
          )}
          {missingAlt && <p className="mt-2 text-xs text-warn">Tipp: Beschreibe deine Bilder kurz – das hilft Menschen mit Screenreader.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="spec mb-1 block">Kategorie</span>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm">
                <option value="">Ohne Kategorie</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="spec mb-1 block">Projekt verknüpfen</span>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-10 text-sm">
                <option value="">Kein Projekt</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="spec mb-1 block">Sichtbarkeit</span>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 text-sm">
                {VISIBILITY.map((v) => (
                  <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                ))}
              </Select>
            </label>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-muted num">{body.length}/5000</span>
            <div className="flex gap-2">
              {compact && (
                <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
              )}
              <Button variant="outline" onClick={() => setLater((v) => !v)} aria-expanded={later} aria-controls="composer-later" disabled={pending}>
                <CalendarClock size={15} aria-hidden /> Später
              </Button>
              <Button onClick={() => submit()} disabled={!canPost || pending}>
                {uploading ? "Lädt hoch …" : pending ? "Veröffentlicht …" : "Veröffentlichen"}
              </Button>
            </div>
          </div>
          {later && (
            <div id="composer-later" className="mt-4 grid gap-4 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-[1fr_auto] sm:items-end animate-fade">
              <div>
                <label htmlFor="composer-when" className="mb-1.5 block text-[13px] font-semibold">Veröffentlichen am</label>
                <div className="flex gap-2">
                  <Input id="composer-when" type="datetime-local" value={when} min={localInputNow(5)} onChange={(e) => setWhen(e.target.value)} className="h-10 max-w-[240px] text-sm" />
                  <Button onClick={() => submit("schedule")} disabled={!canPost || pending || !when} className="h-10">Planen</Button>
                </div>
                <p className="mt-1.5 text-xs text-muted">Bis dahin ist der Beitrag nur für dich sichtbar. <Link href="/studio/inhalte?typ=post&zustand=draft" className="underline underline-offset-2 hover:text-ink">Entwürfe & geplante Beiträge</Link></p>
              </div>
              <Button variant="ghost" onClick={() => submit("draft")} disabled={!canPost || pending}>Als Entwurf speichern</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
