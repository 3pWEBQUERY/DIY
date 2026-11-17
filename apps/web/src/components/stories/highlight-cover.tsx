import { cn } from "@/lib/utils";
import { storyBackground } from "./story-style";

type Cover = { thumb: string | null; background: string | null; text: string | null };

/** Rundes Titelbild eines Highlights: Foto der Story bzw. Farbfläche mit Anfangsbuchstaben. */
export function HighlightCover({ cover, title, size = 64, className }: { cover: Cover; title: string; size?: number; className?: string }) {
  const bg = storyBackground(cover.background);
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-sunken", className)} style={{ width: size, height: size }}>
      {cover.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-bold" style={{ background: bg.bg, color: bg.fg, fontSize: size * 0.38 }} aria-hidden>
          {(title.trim()[0] ?? "·").toUpperCase()}
        </span>
      )}
    </span>
  );
}
