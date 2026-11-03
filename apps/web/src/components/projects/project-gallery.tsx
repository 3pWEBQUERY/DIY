"use client";

import { useState, type KeyboardEvent } from "react";
import { MediaImage, Plate, type Variants } from "@/components/ui/media";
import { cn, pad } from "@/lib/utils";

type Item = { id: string; alt: string; caption?: string; kind: "IMAGE" | "VIDEO" | "FILE"; variants: Variants & { video?: string }; width: number | null; height: number | null };

/**
 * Projektgalerie: grosses Bild + Kontaktbogen (Thumbnails). Pfeiltasten wechseln das Bild.
 * Ohne Medien erscheint eine Tafel (kein Fake-Foto).
 */
export function ProjectGallery({ items, title, seed, category, initialId }: { items: Item[]; title: string; seed: string; category: string; initialId?: string | null }) {
  const start = Math.max(0, items.findIndex((i) => i.id === initialId));
  const [idx, setIdx] = useState(start);
  const cur = items[idx];

  if (!cur) {
    return (
      <div className="crop border border-line" style={{ aspectRatio: "4/3" }}>
        <Plate seed={seed} category={category} label={title} />
      </div>
    );
  }

  const go = (d: number) => setIdx((i) => (i + d + items.length) % items.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <figure aria-roledescription="Galerie" aria-label={`Bilder zu ${title}`}>
      <div
        className="crop relative overflow-hidden border border-line bg-sunken focus-visible:outline-offset-4"
        style={{ aspectRatio: "4/3" }}
        tabIndex={items.length > 1 ? 0 : -1}
        onKeyDown={onKey}
        aria-live="polite"
      >
        {cur.kind === "VIDEO" && cur.variants.video ? (
          <video key={cur.id} src={cur.variants.video} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-ink object-contain" aria-label={cur.alt || "Video"} />
        ) : (
          <MediaImage key={cur.id} variants={cur.variants} alt={cur.alt || title} priority={idx === start} sizes="(min-width: 1024px) 720px, 100vw" className="absolute inset-0 animate-fade" />
        )}
        {items.length > 1 && (
          <>
            <span className="pointer-events-none absolute right-0 top-0 bg-ink px-2 py-1 font-mono text-[11px] text-paper num" aria-hidden>
              {pad(idx + 1)} / {pad(items.length)}
            </span>
            <button type="button" onClick={() => go(-1)} aria-label="Vorheriges Bild" className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize focus-visible:outline-offset-[-4px]" />
            <button type="button" onClick={() => go(1)} aria-label="Nächstes Bild" className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize focus-visible:outline-offset-[-4px]" />
          </>
        )}
      </div>
      {(cur.caption || (cur.alt && items.length > 1)) && (
        <figcaption className="mt-2 flex gap-3 text-[13px] text-muted">
          <span className="spec shrink-0">Abb. {pad(idx + 1)}</span>
          <span className="line-clamp-2">{cur.caption || cur.alt}</span>
        </figcaption>
      )}
      {items.length > 1 && (
        <ol className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8" aria-label="Kontaktbogen">
          {items.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Bild ${i + 1}${m.alt ? `: ${m.alt}` : ""}`}
                aria-current={i === idx ? "true" : undefined}
                className={cn("relative block aspect-square w-full overflow-hidden border transition-colors", i === idx ? "border-ink" : "border-line opacity-70 hover:opacity-100")}
              >
                {m.kind === "VIDEO" ? (
                  <span className="absolute inset-0 grid place-items-center bg-ink font-mono text-[10px] text-paper">VIDEO</span>
                ) : (
                  <MediaImage variants={{ sm: m.variants.thumb ?? m.variants.sm, md: m.variants.sm ?? m.variants.md }} alt="" sizes="80px" className="absolute inset-0" />
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
