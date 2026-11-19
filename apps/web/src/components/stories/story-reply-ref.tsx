"use client";

import Link from "next/link";
import { storyFilterCss } from "@werkraum/shared";
import type { StoryRef } from "@/server/stories/ref";
import { cn } from "@/lib/utils";
import { StoryText } from "./story-content";
import { StoryOverlay } from "./story-layout";
import { rememberStoryReturn } from "./story-return";

/** Bezug einer Nachricht auf eine Story: kleine Vorschau, solange die Story läuft. */
export function StoryReplyRef({ story, mine }: { story: StoryRef; mine: boolean }) {
  const label = mine ? "Antwort auf die Story" : "Antwort auf deine Story";
  return (
    <div className={cn("mb-1 flex flex-col gap-1", mine ? "items-end pr-1" : "items-start pl-1")}>
      <span className="text-[11.5px] text-muted">{label}</span>
      {story.available && story.ownerHandle ? (
        <Link
          href={`/stories/${story.ownerHandle}?story=${story.id}`}
          onClick={rememberStoryReturn}
          className="@container relative block aspect-[9/16] w-20 overflow-hidden rounded-xl border border-line bg-sunken"
          aria-label="Story ansehen"
        >
          {story.kind === "TEXT" ? (
            <StoryText text={story.text ?? ""} background={story.background} look={story.layout?.text} />
          ) : story.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.thumb} alt="" style={story.layout?.media ? { filter: storyFilterCss(story.layout.media.filter, story.layout.media.intensity) } : undefined} className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          {/* Nur Darstellung: der Link ist mit „Story ansehen“ beschriftet */}
          <span aria-hidden>
            <StoryOverlay layout={story.layout} />
          </span>
        </Link>
      ) : (
        <span className="rounded-xl border border-dashed border-line-strong px-3 py-1.5 text-[12px] text-muted">Story nicht mehr verfügbar</span>
      )}
    </div>
  );
}
