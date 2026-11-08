import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Video mit Vorschaubild. Solange der Worker noch umwandelt (keine `video`-Variante),
 * erscheint ein ruhiger Platzhalter statt eines kaputten Players.
 */
export function VideoPlayer({ variants, alt, className, fit = "contain" }: { variants: Record<string, string> | null | undefined; alt?: string; className?: string; fit?: "contain" | "cover" }) {
  const v = variants ?? {};
  if (!v.video) {
    return (
      <div className={cn("grid h-full w-full place-items-center bg-sunken text-center text-muted", className)} role="status">
        <span className="px-4">
          <Loader2 size={22} className="mx-auto animate-spin" aria-hidden />
          <span className="mt-2 block text-[13px]">Video wird verarbeitet …</span>
        </span>
      </div>
    );
  }
  return (
    <video
      src={v.video}
      poster={v.poster ?? v.sm}
      controls
      playsInline
      preload="metadata"
      className={cn("h-full w-full bg-ink", fit === "cover" ? "object-cover" : "object-contain", className)}
      aria-label={alt || "Video"}
    />
  );
}
