"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { HIGHLIGHT_TITLE_MAX } from "@werkraum/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addToHighlightAction, myHighlightsAction, removeFromHighlightAction } from "@/app/(app)/stories/actions";
import { callAction } from "@/lib/use-action";
import { HighlightCover } from "./highlight-cover";

type Own = Extract<Awaited<ReturnType<typeof myHighlightsAction>>, { ok: true }>["data"][number];

/** Story in ein Highlight legen bzw. daraus entfernen – oder gleich ein neues anlegen. */
export function HighlightPickerDialog({ open, storyId, onClose }: { open: boolean; storyId: string; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<Own[] | null>(null);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setTitle("");
    let live = true;
    void callAction(() => myHighlightsAction(storyId)).then((r) => {
      if (!live) return;
      if (!r.ok) toast(r.error, "error");
      setList(r.ok ? r.data : []);
    });
    return () => {
      live = false;
    };
  }, [open, storyId]);

  function toggle(h: Own) {
    setBusyId(h.id);
    start(async () => {
      const r = h.contains ? await callAction(() => removeFromHighlightAction(h.id, storyId)) : await callAction(() => addToHighlightAction({ storyId, highlightId: h.id }));
      setBusyId(null);
      if (!r.ok) return toast(r.error, "error");
      setList((l) =>
        (l ?? [])
          .map((x) => (x.id === h.id ? { ...x, contains: !h.contains, count: x.count + (h.contains ? -1 : 1) } : x))
          .filter((x) => x.count > 0),
      );
      toast(h.contains ? `Aus „${h.title}“ entfernt.` : `Zu „${h.title}“ hinzugefügt.`);
      router.refresh();
    });
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    start(async () => {
      const r = await callAction(() => addToHighlightAction({ storyId, title: t }));
      if (!r.ok) return toast(r.error, "error");
      toast(`Highlight „${t}“ angelegt.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Zu Highlight hinzufügen" description="Highlights bleiben auf deinem Profil, auch wenn die Story abgelaufen ist.">
      {!list ? (
        <div className="grid place-items-center py-8 text-muted">
          <Loader2 className="animate-spin" aria-label="Wird geladen" />
        </div>
      ) : (
        <div className="space-y-5">
          {list.length > 0 && (
            <ul className="-mx-2 divide-y divide-line">
              {list.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => toggle(h)}
                    disabled={pending}
                    aria-pressed={h.contains}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-sunken disabled:opacity-60"
                  >
                    <HighlightCover cover={h.cover} title={h.title} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{h.title}</span>
                      <span className="block text-[12px] text-muted num">{h.count} {h.count === 1 ? "Story" : "Stories"}</span>
                    </span>
                    <span className={cn("grid size-7 place-items-center rounded-full border", h.contains ? "border-moss bg-moss text-paper" : "border-line-strong text-transparent")}>
                      {busyId === h.id ? <Loader2 size={14} className="animate-spin text-muted" aria-hidden /> : <Check size={14} strokeWidth={3} aria-hidden />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={create} className="rounded-2xl border border-line bg-paper p-4">
            <label htmlFor="hl-title" className="mb-2 block text-[13px] font-semibold">Neues Highlight</label>
            <div className="flex gap-2">
              <input
                id="hl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, HIGHLIGHT_TITLE_MAX))}
                placeholder="z. B. Werkstatt, Garn, Projekte 2026"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-card px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
              />
              <Button type="submit" disabled={!title.trim() || pending}>
                <Plus size={16} aria-hidden /> Anlegen
              </Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}
