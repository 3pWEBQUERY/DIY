import { cn } from "@/lib/utils";

/**
 * Grüner Punkt „online“ (unten rechts am Avatar). `decorative`: Daneben steht „Online“ schon als Text –
 * dann für Screenreader ausblenden statt doppelt anzusagen.
 */
export function OnlineDot({ className, size = 11, decorative = false }: { className?: string; size?: number; decorative?: boolean }) {
  return (
    <span
      className={cn("absolute bottom-0 right-0 block rounded-full bg-online ring-2 ring-paper", className)}
      style={{ width: size, height: size }}
      title="Online"
      aria-hidden={decorative || undefined}
    >
      {!decorative && <span className="sr-only">Online</span>}
    </span>
  );
}
