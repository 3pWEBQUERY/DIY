"use client";

import { Play } from "lucide-react";
import type { StoryItem } from "@/server/stories/service";
import { cn } from "@/lib/utils";
import { StoryText } from "./story-content";

/** Miniatur einer Story im Hochformat (Archiv, Highlight-Auswahl). */
export function StoryThumb({ story, className, children }: { story: StoryItem; className?: string; children?: React.ReactNode }) {
  const m = story.media;
  return (
    <span className={cn("@container relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line bg-sunken", className)}>
      {story.kind === "TEXT" ? (
        <StoryText text={story.text} background={story.background} />
      ) : m?.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.thumb} alt={story.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center text-[11px] text-muted">{m?.state === "FAILED" ? "Fehlgeschlagen" : "Wird verarbeitet …"}</span>
      )}
      {m?.kind === "VIDEO" && (
        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/55 text-white" aria-hidden>
          <Play size={11} className="fill-current" />
        </span>
      )}
      {children}
    </span>
  );
}
