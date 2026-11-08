import Image from "next/image";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Seitenverhältnis des Werkuno-Logos (public/brand/werkuno-logo.png, 1400×440). */
const LOGO_RATIO = 1980 / 622;

/** Bildzeichen (Werkuno-Icon: Hammer, Garn, Schere, Pflanze). */
export function Signet({ size = 28, className }: { size?: number; className?: string }) {
  return <Image src="/brand/werkuno-icon.png" alt="" aria-hidden width={size} height={size} className={cn("shrink-0 select-none", className)} priority />;
}

/**
 * Wortmarke „Werkuno“ als Logo-Bild. `compact` zeigt nur das Bildzeichen,
 * `tone="light"` die helle Variante für dunkle Flächen (z. B. Admin-Kopfzeile).
 */
export function Wordmark({ className, compact, tone = "dark", height = 32 }: { className?: string; compact?: boolean; tone?: "dark" | "light" | "mono"; height?: number }) {
  if (compact) return <Signet size={Math.round(height * 1.15)} className={className} />;
  const width = Math.round(height * LOGO_RATIO);
  return (
    <Image
      src={tone === "mono" ? "/brand/werkuno-logo-mono-light.png" : tone === "light" ? "/brand/werkuno-logo-light.png" : "/brand/werkuno-logo.png"}
      alt={BRAND.wordmark}
      width={width}
      height={height}
      priority
      className={cn("shrink-0 select-none", className)}
      style={{ width, height }}
    />
  );
}
