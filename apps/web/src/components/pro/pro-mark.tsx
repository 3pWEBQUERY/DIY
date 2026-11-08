import { cn } from "@/lib/utils";

/** Kennzeichen für Creator Pro – ruhig, klein, eindeutig (kein Glitzer). */
export function ProMark({ className, label = "Pro", size = "sm" }: { className?: string; label?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink font-semibold uppercase tracking-[0.08em] text-paper",
        size === "sm" ? "h-[18px] px-1.5 text-[9.5px]" : "h-6 px-2.5 text-[11px]",
        className,
      )}
      title="Creator Pro"
    >
      <svg viewBox="0 0 12 12" width={size === "sm" ? 8 : 10} height={size === "sm" ? 8 : 10} aria-hidden className="text-clay-soft">
        <path d="M6 0.5 7.3 4.7 11.5 6 7.3 7.3 6 11.5 4.7 7.3 0.5 6 4.7 4.7Z" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}
