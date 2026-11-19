"use client";

import { Play } from "lucide-react";
import { storyFilterCss } from "@werkraum/shared";
import type { StoryItem } from "@/server/stories/service";
import { cn } from "@/lib/utils";
import { StoryText, fills } from "./story-content";
import { StoryOverlay } from "./story-layout";

/** Miniatur einer Story im Hochformat (Archiv, Highlight-Auswahl) – mit Gestaltung wie im Betrachter. */
export function StoryThumb({ story, className, children }: { story: StoryItem; className?: string; children?: React.ReactNode }) {
  const m = story.media;
  const filter = storyFilterCss(story.layout?.media?.filter, story.layout?.media?.intensity);
  return (
    <span className={cn("@container relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line bg-sunken", className)}>
      {story.kind === "TEXT" ? (
        <StoryText text={story.text} background={story.background} look={story.layout?.text} />
      ) : m?.thumb ? (
        // Wie auf der Bühne: Hochformat füllt, alles andere steht vollständig auf der Grundfarbe
        <span className="absolute inset-0" style={{ background: m.dominant ?? "#151312" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.thumb} alt={story.alt} loading="lazy" style={filter ? { filter } : undefined} className={cn("h-full w-full", fills(m) ? "object-cover" : "object-contain")} />
        </span>
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center text-[11px] text-muted">{m?.state === "FAILED" ? "Fehlgeschlagen" : "Wird verarbeitet …"}</span>
      )}
      {(story.kind === "TEXT" || m?.thumb) && <StoryOverlay layout={story.layout} />}
      {m?.kind === "VIDEO" && (
        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/55 text-white" aria-hidden>
          <Play size={11} className="fill-current" />
        </span>
      )}
      {children}
    </span>
  );
}
