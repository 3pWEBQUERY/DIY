"use client";

import { useEffect, useState, useTransition } from "react";
import type { ProjectCardData, ProjectFilters } from "@/server/projects/service";
import { loadProjectsAction } from "@/app/(app)/projekte/actions";
import { ProjectCard, ProjectGrid } from "./project-card";

/** Projektraster mit Cursor-„Mehr laden“ (Filter bleiben serverseitig definiert). */
export function ProjectList({ initial, cursor: initialCursor, filters }: { initial: ProjectCardData[]; cursor: string | null; filters: ProjectFilters }) {
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
      const r = await loadProjectsAction(filters, cursor);
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((p) => !ids.has(p.id))];
      });
      setCursor(r.nextCursor);
    });

  return (
    <div>
      <ProjectGrid>
        {items.map((p, i) => (
          <ProjectCard key={p.id} project={p} priority={i < 4} />
        ))}
      </ProjectGrid>
      {cursor ? (
        <button type="button" onClick={more} disabled={pending} className="mt-12 w-full border border-line py-3 text-sm font-semibold text-muted hover:border-rule-strong hover:text-ink rounded-2xl">
          {pending ? "Lädt …" : "Mehr laden"}
        </button>
      ) : (
        items.length > 12 && (
          <p className="spec mt-14 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" />
            Ende der Liste
            <span className="h-px flex-1 bg-line" />
          </p>
        )
      )}
    </div>
  );
}
