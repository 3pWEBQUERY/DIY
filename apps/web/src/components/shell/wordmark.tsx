import Image from "next/image";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Seitenverhältnis der Wortmarke (public/brand/werkuno-wordmark*.png, 1200×192, eng zugeschnitten). */
const LOGO_RATIO = 1200 / 192;
/** Schrifthöhe relativ zu `height` – entspricht der Grösse der früheren Wortmarke mit Nadel und Schere. */
const LETTER_SCALE = 0.5;

/** Bildzeichen (Werkuno-Icon: Hammer, Garn, Schere, Pflanze). */
export function Signet({ size = 28, className }: { size?: number; className?: string }) {
  return <Image src="/brand/werkuno-icon.png" alt="" aria-hidden width={size} height={size} className={cn("shrink-0 select-none", className)} priority />;
}

/**
 * Wortmarke „WERKUNO“ als Logo-Bild. `compact` zeigt nur das Bildzeichen.
 * Die Web-Ansicht ist hell: Standard ist die schwarze Wortmarke; `tone="light"`/`"mono"` zeigt die weisse
 * Variante für dunkle Flächen (z. B. Admin-Kopfzeile). `height` ist die Höhe des Platzes, den das Logo belegt.
 */
export function Wordmark({ className, compact, tone = "dark", height = 32 }: { className?: string; compact?: boolean; tone?: "dark" | "light" | "mono"; height?: number }) {
  if (compact) return <Signet size={Math.round(height * 1.15)} className={className} />;
  const h = Math.round(height * LETTER_SCALE);
  const width = Math.round(h * LOGO_RATIO);
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} style={{ height }}>
      <Image
        src={tone === "dark" ? "/brand/werkuno-wordmark.png" : "/brand/werkuno-wordmark-white.png"}
        alt={BRAND.wordmark}
        width={width}
        height={h}
        priority
        className="select-none"
        style={{ width, height: h }}
      />
    </span>
  );
}
