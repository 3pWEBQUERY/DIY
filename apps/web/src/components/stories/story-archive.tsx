"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Heart, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { HIGHLIGHT_TITLE_MAX } from "@werkraum/shared";
import type { ArchiveItem } from "@/server/stories/service";
import type { OwnHighlight } from "@/server/stories/highlights";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { MoreMenu } from "@/components/social/actions";
import { cn } from "@/lib/utils";
import { createHighlightAction, deleteHighlightAction, storyArchiveAction, updateHighlightAction } from "@/app/(app)/stories/actions";
import { StoryComposer } from "./story-composer";
import { StoryThumb } from "./story-thumb";
import { HighlightCover } from "./highlight-cover";
import { rememberStoryReturn } from "./story-return";

function stamp(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zurich" });
}

function remaining(iso: string) {
  const h = Math.max(0, (new Date(iso).getTime() - Date.now()) / 3600_000);
  return h >= 1 ? `noch ${Math.floor(h)} Std.` : `noch ${Math.max(1, Math.round(h * 60))} Min.`;
}

/**
 * Eigene Stories: Archiv (auch abgelaufene) und Highlights fürs Profil.
 */
export function StoryArchive({
  handle,
  initial,
  cursor: initialCursor,
  highlights,
  projects,
  openComposer,
}: {
  handle: string;
  initial: ArchiveItem[];
  cursor: string | null;
  highlights: OwnHighlight[];
  projects: { id: string; title: string }[];
  openComposer?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, startMore] = useTransition();
  const [composer, setComposer] = useState(!!openComposer);
  const [editor, setEditor] = useState<null | { id: string | null; title: string; storyIds: string[]; coverStoryId: string | null }>(null);

  useEffect(() => setItems(initial), [initial]);

  function more() {
    if (!cursor) return;
    startMore(async () => {
      const r = await storyArchiveAction(cursor);
      if (!r.ok) return toast(r.error, "error");
      setItems((it) => [...it, ...r.data.items.filter((n) => !it.some((o) => o.id === n.id))]);
      setCursor(r.data.nextCursor);
    });
  }

  async function removeHighlight(h: OwnHighlight) {
    if (!(await confirmDialog({ title: `Highlight „${h.title}“ löschen?`, body: "Die Stories selbst bleiben in deinem Archiv." }))) return;
    const r = await deleteHighlightAction(h.id);
    if (!r.ok) return toast(r.error, "error");
    toast("Highlight gelöscht.");
    router.refresh();
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setComposer(true)}>
          <Plus size={16} aria-hidden /> Neue Story
        </Button>
        <Button variant="outline" onClick={() => setEditor({ id: null, title: "", storyIds: [], coverStoryId: null })} disabled={!items.length}>
          Highlight zusammenstellen
        </Button>
      </div>

      <section aria-labelledby="hl">
        <h2 id="hl" className="spec mb-4 text-ink">01 — Highlights auf deinem Profil</h2>
        {highlights.length ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-5">
            {highlights.map((h) => (
              <li key={h.id} className="flex w-[84px] flex-col items-center gap-1.5">
                <Link href={`/highlights/${h.id}`} onClick={rememberStoryReturn} className="rounded-full outline-offset-4" aria-label={`Highlight ${h.title} ansehen`}>
                  <HighlightCover cover={h.cover} title={h.title} size={72} />
                </Link>
                <span className="flex w-full items-center justify-center gap-0.5">
                  <span className="truncate text-[12px] font-semibold">{h.title}</span>
                  <MoreMenu
                    label={`Highlight ${h.title} bearbeiten`}
                    triggerClassName="grid size-6 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                    items={[
                      { label: "Bearbeiten", icon: <Pencil size={15} />, onSelect: () => setEditor({ id: h.id, title: h.title, storyIds: h.storyIds, coverStoryId: h.coverStoryId }) },
                      { label: "Löschen", icon: <Trash2 size={15} />, danger: true, onSelect: () => void removeHighlight(h) },
                    ]}
                  />
                </span>
                <span className="text-[11px] text-muted num">{h.count} {h.count === 1 ? "Story" : "Stories"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-prose text-sm text-muted">Noch keine Highlights. Sammle Stories zu einem Thema – etwa „Werkstatt“ oder „Garn“ – sie bleiben dauerhaft auf deinem Profil.</p>
        )}
      </section>

      <section aria-labelledby="archiv">
        <h2 id="archiv" className="spec mb-4 text-ink">02 — Archiv</h2>
        {items.length ? (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((s) => (
                <li key={s.id}>
                  <Link href={`/stories/${handle}?story=${s.id}`} onClick={rememberStoryReturn} className="group block rounded-2xl outline-offset-4">
                    <StoryThumb story={s} className="transition-colors group-hover:border-rule-strong">
                      {s.state === "HIDDEN" && <span className="absolute inset-x-2 top-2 rounded-lg bg-danger px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-paper">Ausgeblendet</span>}
                    </StoryThumb>
                  </Link>
                  <p className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-muted" suppressHydrationWarning>
                    <span className={cn("truncate", !s.expired && "font-semibold text-moss")}>{s.expired ? stamp(s.createdAt) : remaining(s.expiresAt)}</span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 num">
                      <span className="inline-flex items-center gap-0.5"><Eye size={11} aria-hidden />{s.stats?.views ?? 0}</span>
                      {(s.stats?.likes ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><Heart size={11} aria-hidden />{s.stats?.likes}</span>}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            {cursor && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={more} disabled={loadingMore}>
                  {loadingMore && <Loader2 size={16} className="animate-spin" aria-hidden />} Ältere Stories laden
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty title="Noch keine Stories" body="Zeig, was gerade auf deiner Werkbank liegt – unfertig ist ausdrücklich erlaubt." action={<Button onClick={() => setComposer(true)}><Plus size={16} aria-hidden /> Erste Story</Button>} />
        )}
      </section>

      <StoryComposer open={composer} onClose={() => setComposer(false)} projects={projects} />
      {editor && <HighlightEditor key={editor.id ?? "neu"} state={editor} items={items} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** Highlight anlegen bzw. bearbeiten: Titel, Auswahl und Reihenfolge der Stories, Titelbild. */
function HighlightEditor({ state, items, onClose }: { state: { id: string | null; title: string; storyIds: string[]; coverStoryId: string | null }; items: ArchiveItem[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(state.title);
  const [picked, setPicked] = useState<string[]>(state.storyIds);
  const [cover, setCover] = useState<string | null>(state.coverStoryId);
  const [pending, start] = useTransition();
  const choosable = items.filter((s) => s.state === "PUBLISHED" || picked.includes(s.id));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    if (cover === id) setCover(null);
  }

  function save() {
    start(async () => {
      // Reihenfolge im Highlight: chronologisch wie im Archiv (älteste zuerst)
      const ordered = [...picked].sort((a, b) => {
        const ia = items.findIndex((s) => s.id === a);
        const ib = items.findIndex((s) => s.id === b);
        return (ib === -1 ? -1 : ib) - (ia === -1 ? -1 : ia);
      });
      if (state.id) {
        const r = await updateHighlightAction(state.id, { title, storyIds: ordered, coverStoryId: cover });
        if (!r.ok) return toast(r.error, "error");
      } else {
        const r = await createHighlightAction({ title, storyIds: ordered });
        if (!r.ok) return toast(r.error, "error");
        if (cover) await updateHighlightAction(r.data.id, { coverStoryId: cover });
      }
      toast(state.id ? "Highlight gespeichert." : "Highlight angelegt.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={state.id ? "Highlight bearbeiten" : "Neues Highlight"} description="Wähle Stories aus und lege eine davon als Titelbild fest." wide>
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
            Name <span className="font-normal text-muted num">{title.length}/{HIGHLIGHT_TITLE_MAX}</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, HIGHLIGHT_TITLE_MAX))}
            placeholder="z. B. Werkstatt"
            className="h-11 w-full rounded-xl border border-line-strong bg-card px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
          />
        </label>
        <ul className="grid max-h-[46dvh] grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-5">
          {choosable.map((s) => {
            const on = picked.includes(s.id);
            return (
              <li key={s.id} className="relative">
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={on} className="block w-full rounded-2xl outline-offset-2">
                  <StoryThumb story={s} className={cn(on ? "border-moss" : "opacity-80")}>
                    <span className={cn("absolute left-2 top-2 grid size-6 place-items-center rounded-full border-2", on ? "border-moss bg-moss text-paper" : "border-white/90 bg-black/25 text-transparent")}>
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                  </StoryThumb>
                </button>
                {on && (
                  <button
                    type="button"
                    onClick={() => setCover(cover === s.id ? null : s.id)}
                    aria-pressed={cover === s.id}
                    className={cn("absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", cover === s.id ? "bg-ink text-paper" : "bg-card text-ink")}
                  >
                    {cover === s.id ? "Titelbild" : "Als Titel"}
                  </button>
                )}
                <span className="mt-1 block text-center text-[10px] text-muted">{stamp(s.createdAt)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[13px] text-muted num">{picked.length} ausgewählt</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Abbrechen</Button>
            <Button onClick={save} disabled={!title.trim() || !picked.length || pending}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Speichern
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
