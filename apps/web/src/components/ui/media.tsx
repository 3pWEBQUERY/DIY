import { categoryBySlug } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { Glyph } from "./glyphs";

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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PLATE_TONES = [
  { bg: "#F2F0EA", ink: "#252822", accent: "#B46C4D" },
  { bg: "#E5ECE5", ink: "#2F4C3B", accent: "#B46C4D" },
  { bg: "#F3E6DF", ink: "#8F5239", accent: "#3D604C" },
  { bg: "#FFFFFF", ink: "#252822", accent: "#3D604C" },
];

/**
 * „Tafel“ – Platzhalter für Inhalte ohne Foto. Eine Werkzeichnung im Stil eines
 * Buchtafel-Drucks, deterministisch aus Titel + Kategorie. Kein Fake-Foto.
 */
export function Plate({ seed, category, label, className, number }: { seed: string; category?: string | null; label?: string; className?: string; number?: boolean }) {
  const h = hash(seed);
  const tone = PLATE_TONES[h % PLATE_TONES.length]!;
  const cat = categoryBySlug(category);
  const rot = ((h >> 4) % 13) - 6;
  const plateNo = String((h % 97) + 1).padStart(2, "0");
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} style={{ background: tone.bg, color: tone.ink }} aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <pattern id={`g${h}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0v6" fill="none" stroke={tone.ink} strokeOpacity="0.07" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill={`url(#g${h})`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div style={{ transform: `rotate(${rot}deg)`, width: "46%", aspectRatio: "1" }} className="relative">
          <Glyph name={cat?.glyph ?? "spark"} size={400} className="h-full w-full" strokeWidth={1.3} />
          <span className="absolute -right-2 top-1/2 h-px w-[22%] origin-left" style={{ background: tone.accent }} />
        </div>
      </div>
      {number !== false && (
        <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">
          Tafel {plateNo}
          {cat ? ` · ${cat.short}` : ""}
        </div>
      )}
      {label && <div className="absolute bottom-3 left-3 right-3 truncate font-serif text-sm italic opacity-80">{label}</div>}
    </div>
  );
}

/** Cover: Foto, sonst Tafel. Feste Seitenverhältnisse je Komponente (§28.6). */
export function Cover({
  url,
  variants,
  alt,
  seed,
  category,
  ratio = "4/3",
  className,
  sizes,
  priority,
  label,
  plateNumber,
}: {
  plateNumber?: boolean;
  url?: string | null;
  variants?: Variants | null;
  alt: string;
  seed: string;
  category?: string | null;
  ratio?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  label?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-sunken", className)} style={{ aspectRatio: ratio }}>
      {url || variants?.md ? (
        <MediaImage url={url} variants={variants} alt={alt} sizes={sizes} priority={priority} className="absolute inset-0" />
      ) : (
        <Plate seed={seed} category={category} label={label} number={plateNumber} />
      )}
    </div>
  );
}
