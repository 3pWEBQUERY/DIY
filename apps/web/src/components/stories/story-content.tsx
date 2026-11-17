"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { storyBackground, storyTextSize } from "./story-style";

/**
 * Text-Story: Satz auf ruhiger Farbfläche. Die Bühne braucht `container-type: inline-size`
 * (Klasse `@container`), damit die Schrift mit der Grösse mitwächst – im Betrachter, in der
 * Vorschau und als Miniatur gleich.
 */
export function StoryText({ text, background, className, placeholder }: { text: string; background: string | null | undefined; className?: string; placeholder?: string }) {
  const bg = storyBackground(background);
  const shown = text || placeholder || "";
  return (
    <div className={cn("absolute inset-0 grid place-items-center px-[9cqw]", className)} style={{ background: bg.bg, color: bg.fg }}>
      <p
        className={cn("w-full whitespace-pre-line break-words text-center font-bold tracking-[-0.02em]", !text && "opacity-55")}
        style={{ fontSize: `${storyTextSize(shown)}cqw`, lineHeight: 1.18 }}
      >
        {shown}
      </p>
    </div>
  );
}

type Media = { kind: "IMAGE" | "VIDEO"; image: string | null; video: string | null; poster: string | null; width: number | null; height: number | null; dominant: string | null };

/** Fast hochformatige Fotos füllen die Bühne; alle anderen stehen vollständig auf ihrer Grundfarbe. */
function fills(m: Pick<Media, "width" | "height">) {
  if (!m.width || !m.height) return true;
  const r = m.width / m.height;
  return r > 0.5 && r < 0.66;
}

export const StoryMedia = forwardRef<HTMLVideoElement, { media: Media; alt: string; muted?: boolean; onLoaded?: () => void; className?: string }>(function StoryMedia(
  { media, alt, muted, onLoaded, className },
  videoRef,
) {
  const cover = fills(media);
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
            className={cn("h-full w-full", cover ? "object-cover" : "object-contain")}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.poster ?? ""} alt={alt} className="h-full w-full object-cover opacity-60" />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.image ?? media.poster ?? ""} alt={alt} onLoad={onLoaded} draggable={false} className={cn("h-full w-full select-none", cover ? "object-cover" : "object-contain")} />
      )}
    </div>
  );
});
