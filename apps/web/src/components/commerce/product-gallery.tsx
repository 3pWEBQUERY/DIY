"use client";

import { useState } from "react";
import { MediaImage, Plate, type Variants } from "@/components/ui/media";
import { cn } from "@/lib/utils";

type Item = { id: string; alt: string; variants: Variants; kind: string };

/** Produktgalerie: grosses Bild 4/5, nummerierte Miniaturen (Tafel-Nummern statt Punkte). */
export function ProductGallery({ items, seed, category, title }: { items: Item[]; seed: string; category: string; title: string }) {
  const [idx, setIdx] = useState(0);
  const current = items[idx];
  return (
    <div className="space-y-3">
      <div className="crop relative aspect-[4/5] overflow-hidden border border-line bg-sunken rounded-2xl">
        {current ? (
          current.kind === "VIDEO" ? (
            <video src={(current.variants as Record<string, string>).video} controls playsInline preload="metadata" className="h-full w-full bg-ink object-contain" aria-label={current.alt || title} />
          ) : (
            <MediaImage variants={current.variants} alt={current.alt || title} priority sizes="(min-width: 1024px) 560px, 100vw" className="absolute inset-0" />
          )
        ) : (
          <Plate seed={seed} category={category} label={title} />
        )}
        {items.length > 1 && (
          <span className="absolute right-3 top-3 bg-ink/85 px-2 py-0.5 font-mono text-[11px] text-paper rounded-2xl" aria-hidden>
            {String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
          </span>
        )}
      </div>
      {items.length > 1 && (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label="Bilder">
          {items.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Bild ${i + 1}${m.alt ? `: ${m.alt}` : ""}`}
                aria-current={i === idx}
                className={cn("relative block aspect-square w-full overflow-hidden border bg-sunken transition-colors rounded-2xl", i === idx ? "border-ink" : "border-line hover:border-line-strong")}
              >
                <MediaImage variants={{ sm: m.variants.thumb ?? m.variants.sm, md: m.variants.sm }} alt="" sizes="96px" className="absolute inset-0" />
                <span className={cn("absolute bottom-0 left-0 px-1 font-mono text-[9px]", i === idx ? "bg-ink text-paper" : "bg-paper/90 text-ink-2")}>{String(i + 1).padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
