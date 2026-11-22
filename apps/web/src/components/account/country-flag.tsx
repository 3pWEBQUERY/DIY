import type { MemberCountry } from "@werkraum/shared";
import { cn } from "@/lib/utils";

/**
 * Quadratische Landesflagge mit abgerundeten Ecken (statt Emoji, die je nach System anders aussehen).
 * Gezeichnet im 32er-Raster; Gegenstück in iOS: `CountryFlagView`.
 */
const FLAG: Record<MemberCountry, React.ReactNode> = {
  // Schweiz: rot mit weissem Kreuz (Arme 6 breit, 20 lang)
  CH: (
    <>
      <rect width="32" height="32" fill="#DA291C" />
      <rect x="13" y="6" width="6" height="20" fill="#fff" />
      <rect x="6" y="13" width="20" height="6" fill="#fff" />
    </>
  ),
  // Liechtenstein: blau/rot mit goldener Krone oben links
  LI: (
    <>
      <rect width="32" height="16" fill="#002B7F" />
      <rect y="16" width="32" height="16" fill="#CE1126" />
      <g fill="#FFD83D">
        <path d="M6.6 11.4 5.9 6.7l2.4 1.9 2.2-3.3 2.2 3.3 2.4-1.9-.7 4.7z" />
        <rect x="6.6" y="11.8" width="8.2" height="1.3" rx=".4" />
        <circle cx="10.5" cy="4.3" r=".9" />
      </g>
    </>
  ),
  // Deutschland: schwarz, rot, gold
  DE: (
    <>
      <rect width="32" height="10.7" fill="#000" />
      <rect y="10.66" width="32" height="10.7" fill="#DD0000" />
      <rect y="21.33" width="32" height="10.67" fill="#FFCE00" />
    </>
  ),
  // Österreich: rot, weiss, rot
  AT: (
    <>
      <rect width="32" height="32" fill="#C8102E" />
      <rect y="10.66" width="32" height="10.68" fill="#fff" />
    </>
  ),
};

export function CountryFlag({ country, size = 28, className }: { country: MemberCountry; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 overflow-hidden rounded-[22%] border border-black/10", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width="100%" height="100%" preserveAspectRatio="none" className="block">
        {FLAG[country]}
      </svg>
    </span>
  );
}
