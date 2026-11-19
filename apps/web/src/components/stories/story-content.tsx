"use client";

import { forwardRef } from "react";
import type { StoryTextAlign, StoryTextStyle } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { storyBackground, storyTextSize } from "./story-style";
import { Pill, alignClass, textStyleCss } from "./story-layout";

/**
 * Text-Story: Satz auf ruhiger Farbfläche. Die Bühne braucht `container-type: inline-size`
 * (Klasse `@container`), damit die Schrift mit der Grösse mitwächst – im Betrachter, in der
 * Vorschau und als Miniatur gleich.
 */
export type StoryTextLook = { style: StoryTextStyle; align: StoryTextAlign; scale: number };
/** Bisherige Darstellung: fett, zentriert, Grösse nach Textlänge */
export const DEFAULT_TEXT_LOOK: StoryTextLook = { style: "bold", align: "center", scale: 1 };

export function StoryText({ text, background, className, placeholder, look }: { text: string; background: string | null | undefined; className?: string; placeholder?: string; look?: StoryTextLook | null }) {
  const bg = storyBackground(background);
  const shown = text || placeholder || "";
  const l = look ?? DEFAULT_TEXT_LOOK;
  const pill = l.style === "pill";
  return (
    <div className={cn("absolute inset-0 grid place-items-center px-[9cqw]", className)} style={{ background: bg.bg, color: bg.fg }}>
      <p
        className={cn("w-full whitespace-pre-line break-words", alignClass[l.align], !text && "opacity-55")}
        style={{ fontSize: `${storyTextSize(shown) * l.scale}cqw`, lineHeight: pill ? 1.45 : 1.18, ...textStyleCss(l.style) }}
      >
        {/* Fläche in Schriftfarbe, Schrift in Hintergrundfarbe – dasselbe geprüfte Farbpaar */}
        {pill ? <Pill bg={bg.fg} fg={bg.bg}>{shown}</Pill> : shown}
      </p>
    </div>
  );
}

type Media = { kind: "IMAGE" | "VIDEO"; image: string | null; video: string | null; poster: string | null; width: number | null; height: number | null; dominant: string | null };

/** Fast hochformatige Fotos füllen die Bühne; alle anderen stehen vollständig auf ihrer Grundfarbe. */
export function fills(m: Pick<Media, "width" | "height">) {
  if (!m.width || !m.height) return true;
  const r = m.width / m.height;
  return r > 0.5 && r < 0.66;
}

/**
 * Foto oder Video auf der Bühne. `filter` ist ein CSS-Filter (`storyFilterCss`) – nicht destruktiv,
 * in Editor, Betrachter und Miniatur gleich.
 */
export const StoryMedia = forwardRef<HTMLVideoElement, { media: Media; alt: string; muted?: boolean; onLoaded?: () => void; className?: string; filter?: string }>(function StoryMedia(
  { media, alt, muted, onLoaded, className, filter },
  videoRef,
) {
  const cover = fills(media);
  const look = filter ? { filter } : undefined;
  return (
    <div className={cn("absolute inset-0", className)} style={{ background: media.dominant ?? "#151312" }}>
      {media.kind === "VIDEO" ? (
        media.video ? (
          <video
            ref={videoRef}
            src={media.video}
            poster={media.poster ?? undefined}
            playsInline
            muted={muted}
            preload="auto"
            onLoadedData={onLoaded}
            aria-label={alt || undefined}
            style={look}
            className={cn("h-full w-full", cover ? "object-cover" : "object-contain")}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.poster ?? ""} alt={alt} style={look} className="h-full w-full object-cover opacity-60" />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.image ?? media.poster ?? ""} alt={alt} onLoad={onLoaded} draggable={false} style={look} className={cn("h-full w-full select-none", cover ? "object-cover" : "object-contain")} />
      )}
    </div>
  );
});
