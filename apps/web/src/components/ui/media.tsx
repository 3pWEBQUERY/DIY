import { cn } from "@/lib/utils";

export type Variants = Partial<Record<"sm" | "md" | "lg" | "thumb", string>> & { original?: string };

/** Responsives Bild aus den vom Worker erzeugten Varianten (§25.6). */
export function MediaImage({
  url,
  variants,
  alt,
  className,
  sizes = "(min-width: 1024px) 640px, 100vw",
  priority,
  width,
  height,
}: {
  url?: string | null;
  variants?: Variants | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  width?: number | null;
  height?: number | null;
}) {
  const v = variants ?? {};
  const src = v.md ?? v.lg ?? url ?? v.original;
  if (!src) return null;
  const srcSet = [v.sm && `${v.sm} 480w`, v.md && `${v.md} 960w`, v.lg && `${v.lg} 1600w`].filter(Boolean).join(", ");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("block h-full w-full object-cover", className)}
    />
  );
}

export type PlaceholderKind = "project" | "workbench" | "article" | "community" | "tutorial" | "product";

/** Bild je Inhaltstyp (public/placeholders) und Bildausschnitt für kleine, quadratische Vorschauen. */
const PLACEHOLDERS: Record<PlaceholderKind, { file: string; focus: string }> = {
  project: { file: "projekt", focus: "48% 50%" },
  workbench: { file: "werkbank", focus: "50% 55%" },
  article: { file: "artikel", focus: "52% 45%" },
  community: { file: "community", focus: "50% 55%" },
  // Ohne eigenes Motiv: Anleitungen zeigen das Werkzeug, Produkte und Shops die Werkstücke
  tutorial: { file: "werkbank", focus: "50% 55%" },
  product: { file: "community", focus: "50% 55%" },
};

/**
 * Platzhalter für Inhalte ohne eigenes Bild – ein festes Motiv je Inhaltstyp.
 * Füllt den nächsten positionierten Container vollständig aus.
 */
export function Placeholder({ kind, className, sizes = "(min-width: 768px) 640px, 100vw" }: { kind: PlaceholderKind; className?: string; sizes?: string }) {
  const p = PLACEHOLDERS[kind];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/placeholders/${p.file}-1280.webp`}
      srcSet={`/placeholders/${p.file}-640.webp 640w, /placeholders/${p.file}-1280.webp 1280w`}
      sizes={sizes}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      data-placeholder={kind}
      className={cn("absolute inset-0 block h-full w-full object-cover", className)}
      style={{ objectPosition: p.focus }}
    />
  );
}

/** Cover: Foto, sonst Platzhalter-Motiv des Inhaltstyps. Feste Seitenverhältnisse je Komponente (§28.6). */
export function Cover({
  url,
  variants,
  alt,
  kind,
  ratio = "4/3",
  className,
  sizes,
  priority,
  fit = "cover",
}: {
  /** „contain“: Bild vollständig zeigen statt formatfüllend beschneiden (Produktfotos) */
  fit?: "cover" | "contain";
  url?: string | null;
  variants?: Variants | null;
  alt: string;
  /** Welches Platzhalter-Motiv ohne Bild erscheint */
  kind: PlaceholderKind;
  ratio?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-sunken", className)} style={{ aspectRatio: ratio }}>
      {url || variants?.md ? (
        <MediaImage url={url} variants={variants} alt={alt} sizes={sizes} priority={priority} className={cn("zoom-media absolute inset-0", fit === "contain" && "object-contain")} />
      ) : (
        <Placeholder kind={kind} sizes={sizes} className="zoom-media" />
      )}
    </div>
  );
}
