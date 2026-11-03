import { cn } from "@/lib/utils";

/** Wortmarke: Serif-Schriftzug + „Faden“-Signet (eine Linie, die eine Schlaufe bildet). */
export function Signet({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <path
        d="M3 24c4 0 6-3 8-8s4-10 8-10 5 4 3 7-6 4-8 2 0-6 4-6 7 4 7 9-2 6-4 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="26.6" cy="24" r="1.7" fill="#B46C4D" />
    </svg>
  );
}

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <Signet />
      {!compact && <span className="font-serif text-[22px] font-medium tracking-[-0.02em] leading-none">Werkraum</span>}
    </span>
  );
}
