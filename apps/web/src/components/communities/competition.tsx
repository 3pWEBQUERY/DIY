"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Medal, Trash2, Trophy } from "lucide-react";
import { CHALLENGE_VOTES_PER_PERSON } from "@werkraum/shared";
import type { CompetitionView } from "@/server/communities/competitions";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { publishJuryResultAction, removeEntryAction, submitEntryAction, voteEntryAction, withdrawEntryAction } from "@/app/(app)/c/[slug]/wettbewerbe/actions";
import { callAction } from "@/lib/use-action";

type Option = { id: string; title: string; coverUrl: string | null };

const PLACE_STYLE: Record<number, string> = {
  1: "bg-[#C9A227] text-white",
  2: "bg-[#9AA3AD] text-white",
  3: "bg-[#B07A4F] text-white",
};

export function PlaceBadge({ place, className }: { place: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.15)]", PLACE_STYLE[place] ?? "bg-ink text-paper", className)}>
      <Medal size={14} aria-hidden /> {place}. Platz
    </span>
  );
}

/* ───────────── Teilnahme-Panel ───────────── */

export function EntryPanel({ c, options, loggedIn }: { c: CompetitionView; options: Option[]; loggedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const my = c.viewer.myEntry;
  const myProject = my ? c.entries.find((e) => e.id === my.id)?.project : null;

  if (c.phase !== "open") return null;
  if (!loggedIn)
    return (
      <Panel>
        <p className="text-[14.5px]">Melde dich an und tritt der Community bei, um ein Projekt einzureichen.</p>
        <Link href={`/anmelden?weiter=/c/${c.community.slug}/wettbewerbe/${c.id}`} className="mt-3 inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper">
          Anmelden
        </Link>
      </Panel>
    );
  if (!c.viewer.isMember)
    return (
      <Panel>
        <p className="text-[14.5px]">Mitmachen können Mitglieder von {c.community.name}.</p>
        <Link href={`/c/${c.community.slug}`} className="mt-3 inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper">
          Zur Community
        </Link>
      </Panel>
    );

  const withdraw = async () => {
    if (!(await confirmDialog({ title: "Einreichung zurückziehen?", body: "Du kannst bis zum Einreichungsschluss jederzeit erneut einreichen.", confirmLabel: "Zurückziehen", tone: "danger" }))) return;
    start(async () => {
      const r = await callAction(() => withdrawEntryAction(c.community.slug, c.id));
      if (r.ok) {
        toast(r.message ?? "Erledigt.");
        router.refresh();
      } else toast(r.error, "error");
    });
  };

  return (
    <Panel>
      {my ? (
        <>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-moss">
            <Check size={15} aria-hidden /> Du bist dabei
          </p>
          <p className="mt-1 text-[15px] font-semibold">{myProject?.title ?? "Dein Projekt"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={pending}>
              Anderes Projekt wählen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void withdraw()} disabled={pending} className="text-muted hover:text-danger">
              Zurückziehen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[14.5px]">Reiche eines deiner öffentlichen Projekte ein – pro Person ein Beitrag.</p>
          <Button className="mt-3" onClick={() => setOpen(true)}>
            <Trophy size={15} aria-hidden /> Projekt einreichen
          </Button>
        </>
      )}
      <SubmitDialog open={open} onClose={() => setOpen(false)} c={c} options={options} />
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-card p-5">{children}</div>;
}

function SubmitDialog({ open, onClose, c, options }: { open: boolean; onClose: () => void; c: CompetitionView; options: Option[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(c.viewer.myEntry?.projectId ?? "");
  const [note, setNote] = useState(c.viewer.myEntry?.note ?? "");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await callAction(() => submitEntryAction(c.community.slug, c.id, { projectId, note }));
      if (r.ok) {
        toast(r.data.replaced ? "Einreichung aktualisiert." : (r.message ?? "Eingereicht."));
        onClose();
        router.refresh();
      } else toast(r.error, "error");
    });
  return (
    <Dialog open={open} onClose={onClose} title="Projekt einreichen" description={c.title} wide>
      {options.length === 0 ? (
        <div className="text-[14.5px] text-muted">
          <p>Du hast noch kein veröffentlichtes, öffentliches Projekt.</p>
          <Link href="/projekte/neu" className="mt-3 inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper">
            Projekt anlegen
          </Link>
        </div>
      ) : (
        <>
          <ul role="radiogroup" aria-label="Projekt" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((p) => {
              const on = p.id === projectId;
              return (
                <li key={p.id}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => setProjectId(p.id)} className={cn("block w-full overflow-hidden rounded-2xl text-left ring-2 ring-transparent transition", on && "ring-moss")}>
                    <span className="relative block aspect-[4/3] bg-sunken">
                      {p.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                      {on && (
                        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-moss text-paper">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="block truncate px-1 pt-2 text-[13px] font-medium">{p.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <label htmlFor="entry-note" className="mb-1.5 mt-5 block text-[13px] font-semibold">
            Ein paar Worte dazu <span className="font-normal text-muted">(optional)</span>
          </label>
          <Textarea id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Was war die Idee, was war knifflig?" />
          <Button className="mt-4 w-full" size="lg" disabled={!projectId || pending} onClick={submit}>
            {pending && <Loader2 size={15} className="animate-spin" />}
            {c.viewer.myEntry ? "Einreichung aktualisieren" : "Einreichen"}
          </Button>
        </>
      )}
    </Dialog>
  );
}

/* ───────────── Einreichungen: Abstimmen, Jury, Moderation ───────────── */

export function EntriesGrid({ c }: { c: CompetitionView }) {
  const router = useRouter();
  const [votes, setVotes] = useState<string[]>(c.viewer.myVotes);
  const [places, setPlaces] = useState<Record<string, number>>({});
  const [pending, start] = useTransition();
  const voting = c.phase === "voting" && c.judging === "VOTES";
  const jury = c.phase === "jury" && c.viewer.isMod;
  const left = CHALLENGE_VOTES_PER_PERSON - votes.length;

  const toggle = (entryId: string) => {
    const on = !votes.includes(entryId);
    if (on && left <= 0) return toast(`Du hast alle ${CHALLENGE_VOTES_PER_PERSON} Stimmen vergeben. Nimm eine zurück, um neu zu wählen.`, "error");
    setVotes((v) => (on ? [...v, entryId] : v.filter((x) => x !== entryId)));
    start(async () => {
      const r = await callAction(() => voteEntryAction(entryId, on));
      if (!r.ok) {
        setVotes((v) => (on ? v.filter((x) => x !== entryId) : [...v, entryId]));
        toast(r.error, "error");
      }
    });
  };
  const remove = async (entryId: string, title: string) => {
    if (!(await confirmDialog({ title: "Einreichung entfernen?", body: `„${title}“ wird aus dem Wettbewerb entfernt; die Person wird benachrichtigt.`, confirmLabel: "Entfernen", tone: "danger" }))) return;
    start(async () => {
      const r = await callAction(() => removeEntryAction(c.community.slug, c.id, entryId));
      if (r.ok) router.refresh();
      else toast(r.error, "error");
    });
  };
  const setPlace = (entryId: string, place: number) =>
    setPlaces((p) => {
      const next = Object.fromEntries(Object.entries(p).filter(([id, pl]) => id !== entryId && pl !== place));
      return place ? { ...next, [entryId]: place } : next;
    });
  const publish = async () => {
    const list = Object.entries(places).map(([entryId, place]) => ({ entryId, place }));
    if (!(await confirmDialog({ title: "Ergebnis veröffentlichen?", body: "Alle Teilnehmenden werden benachrichtigt. Das Ergebnis lässt sich danach nicht mehr ändern.", confirmLabel: "Veröffentlichen" }))) return;
    start(async () => {
      const r = await callAction(() => publishJuryResultAction(c.community.slug, c.id, list));
      if (r.ok) {
        toast(r.message ?? "Veröffentlicht.");
        router.refresh();
      } else toast(r.error, "error");
    });
  };

  if (!c.entries.length)
    return <p className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-[14.5px] text-muted">{c.phase === "upcoming" ? "Die Einreichung startet bald." : "Noch keine Einreichungen – sei die erste Person!"}</p>;

  return (
    <div>
      {voting && c.viewer.isMember && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-sunken px-4 py-3 text-[14px]">
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: CHALLENGE_VOTES_PER_PERSON }, (_, i) => (
              <span key={i} className={cn("size-2.5 rounded-full", i < votes.length ? "bg-moss" : "bg-line-strong")} />
            ))}
          </span>
          <span>
            Du hast <strong>{votes.length}</strong> von {CHALLENGE_VOTES_PER_PERSON} Stimmen vergeben. Zwischenstände bleiben bis zum Ende verborgen.
          </span>
        </div>
      )}
      {jury && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-[14px]">
          <span>Jury: Wähle bei bis zu drei Einreichungen einen Platz und veröffentliche das Ergebnis.</span>
          <Button size="sm" disabled={!Object.keys(places).length || pending} onClick={() => void publish()}>
            Ergebnis veröffentlichen
          </Button>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-x-5 gap-y-9 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {c.entries.map((e) => {
          const voted = votes.includes(e.id);
          return (
            <li key={e.id} className="flex flex-col">
              <div>
                <ProjectCard project={e.project!} ratio="4/3" />
              </div>
              {e.note && <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">„{e.note}“</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {e.place && <PlaceBadge place={e.place} />}
                {e.votes != null && <span className="text-[13px] text-muted">{e.votes} {e.votes === 1 ? "Stimme" : "Stimmen"}</span>}
                {voting && c.viewer.isMember && !e.mine && (
                  <button
                    type="button"
                    aria-pressed={voted}
                    disabled={pending && !voted && left <= 0}
                    onClick={() => toggle(e.id)}
                    className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-semibold transition-colors", voted ? "border-moss bg-moss text-paper" : "border-line-strong bg-card text-ink hover:border-moss")}
                  >
                    {voted ? <Check size={14} aria-hidden /> : <Trophy size={14} aria-hidden />}
                    {voted ? "Deine Stimme" : "Stimme geben"}
                  </button>
                )}
                {e.mine && c.phase !== "ended" && <span className="rounded-full bg-moss-soft px-2.5 py-1 text-[12px] font-medium text-moss-ink">Deine Einreichung</span>}
                {jury && (
                  <span role="radiogroup" aria-label={`Platz für ${e.project!.title}`} className="inline-flex rounded-xl bg-sunken p-1 text-[12.5px]">
                    {[0, 1, 2, 3].map((pl) => (
                      <button key={pl} type="button" role="radio" aria-checked={(places[e.id] ?? 0) === pl} onClick={() => setPlace(e.id, pl)} className={cn("h-7 min-w-9 rounded-lg px-2 font-semibold text-muted", (places[e.id] ?? 0) === pl && "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]")}>
                        {pl ? `${pl}.` : "–"}
                      </button>
                    ))}
                  </span>
                )}
                {c.viewer.isMod && c.phase !== "ended" && (
                  <button type="button" onClick={() => void remove(e.id, e.project!.title)} className="ml-auto grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-danger" aria-label="Einreichung entfernen" title="Entfernen">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
