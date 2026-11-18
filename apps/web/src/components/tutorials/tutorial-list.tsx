"use client";

import { useTransition } from "react";
import type { TutorialCardData, TutorialFilters } from "@/server/tutorials/service";
import { loadTutorialsAction } from "@/app/(app)/anleitungen/actions";
import { callData } from "@/lib/use-action";
import { usePagedList } from "@/lib/use-paged-list";
import { toast } from "@/components/ui/toast";
import { TutorialCard, TutorialGrid } from "./tutorial-card";

/** Anleitungsraster mit Cursor-„Mehr laden“. */
export function TutorialList({ initial, cursor: initialCursor, filters }: { initial: TutorialCardData[]; cursor: string | null; filters: TutorialFilters }) {
  // Neu beginnen nur bei anderen Filtern; router.refresh() mischt die erste Seite ein
  const { items, cursor, append } = usePagedList(initial, initialCursor, JSON.stringify(filters));
  const [pending, start] = useTransition();

  const more = () =>
    cursor &&
    !pending &&
    start(async () => {
      const r = await callData(() => loadTutorialsAction(filters, cursor));
      if (!r.ok) return void toast(r.error, "error");
      append(r.data.items, r.data.nextCursor);
    });

  return (
    <div>
      <TutorialGrid>
        {items.map((t, i) => (
          <TutorialCard key={t.id} tutorial={t} priority={i < 3} />
        ))}
      </TutorialGrid>
      {cursor && (
        <button type="button" onClick={more} disabled={pending} className="mt-12 w-full border border-line py-3 text-sm font-semibold text-muted hover:border-rule-strong hover:text-ink rounded-2xl">
          {pending ? "Lädt …" : "Mehr laden"}
        </button>
      )}
    </div>
  );
}
