"use client";

import { useEffect, useState, useTransition } from "react";
import type { TutorialCardData, TutorialFilters } from "@/server/tutorials/service";
import { loadTutorialsAction } from "@/app/(app)/anleitungen/actions";
import { TutorialCard, TutorialGrid } from "./tutorial-card";

/** Anleitungsraster mit Cursor-„Mehr laden“. */
export function TutorialList({ initial, cursor: initialCursor, filters }: { initial: TutorialCardData[]; cursor: string | null; filters: TutorialFilters }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, start] = useTransition();

  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
  }, [initial, initialCursor]);

  const more = () =>
    cursor &&
    start(async () => {
      const r = await loadTutorialsAction(filters, cursor);
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((p) => !ids.has(p.id))];
      });
      setCursor(r.nextCursor);
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
