import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Filter-Chips als Links (serverseitig, ohne JS). Aktiver Zustand in Tinte (§28).
 * Für Filterleisten auf Index-Seiten.
 */
export function ChipLink({ href, active, children, count, className }: { href: string; active?: boolean; children: ReactNode; count?: number; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      scroll={false}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-[13px] transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink-2 hover:border-ink hover:text-ink",
        className,
      )}
    >
      {children}
      {count != null && <span className={cn("font-mono text-[10px]", active ? "text-paper/70" : "text-muted")}>{count}</span>}
    </Link>
  );
}

/** Beschriftete Chip-Zeile, horizontal scrollbar auf kleinen Bildschirmen. */
export function ChipRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)} role="group" aria-label={label}>
      <span className="spec w-24 shrink-0">{label}</span>
      <div className="-mr-4 flex min-w-0 gap-1.5 overflow-x-auto pr-4 scrollbar-none">{children}</div>
    </div>
  );
}
