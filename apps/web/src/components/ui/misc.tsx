import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ───────── Badge ───────── */
type Tone = "neutral" | "moss" | "clay" | "ink" | "warn" | "danger" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  moss: "bg-moss-soft text-moss-ink",
  clay: "bg-clay-soft text-clay-ink",
  ink: "bg-ink/[0.07] text-ink",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line-strong text-ink-2",
};
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.07em] whitespace-nowrap", tones[tone], className)}
      {...p}
    />
  );
}

/* ───────── Avatar: Foto oder Monogramm (kein generisches Icon) ───────── */
const monoPalette = ["#B64B3A", "#B64B3A", "#262427", "#A65A49", "#973B2C", "#5B4F52"];
export function Avatar({
  src,
  name,
  size = 40,
  className,
  ring,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color = monoPalette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % monoPalette.length];
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full", ring && "outline outline-2 outline-paper", className)}
      style={{ width: size, height: size, background: src ? "#F3EFEB" : color }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="font-mono font-medium text-paper" style={{ fontSize: Math.max(10, size * 0.36) }} aria-hidden>
          {initials || "·"}
        </span>
      )}
    </span>
  );
}

/* ───────── Spec: Datenblatt-Zeile ───────── */
export function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="spec">{label}</dt>
      <dd className="text-[15px] font-semibold text-ink num">{children}</dd>
    </div>
  );
}

/* ───────── Abschnittstitel mit Nummer ───────── */
export function SectionTitle({ n, icon, title, action, className }: { n?: string; icon?: ReactNode; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-4 border-b border-rule pb-2.5", icon ? "items-center" : "items-end", className)}>
      <h2 className={cn("flex gap-3 text-[15px] font-bold tracking-tight", icon ? "items-center gap-2.5" : "items-baseline")}>
        {icon && <span className="grid shrink-0 place-items-center">{icon}</span>}
        {!icon && n && <span className="spec text-ink">{n}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ───────── Leerer Zustand (§18.4 verständliche leere Ergebnisse) ───────── */
export function Empty({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-dashed border-line-strong px-6 py-12 text-center rounded-2xl", className)}>
      <svg aria-hidden width="56" height="28" viewBox="0 0 56 28" className="mx-auto mb-4 text-line-strong">
        <path d="M2 20c6-14 12-14 18 0s12 14 18 0 12-14 16-6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <p className="headline text-xl">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ───────── Kennzahl ───────── */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="border-l border-line pl-4">
      <div className="spec">{label}</div>
      <div className="mt-1 text-2xl font-semibold num tracking-tight">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

/* ───────── Hinweisbox ───────── */
/**
 * Hinweisbox. `alert` nur für dynamisch eingeblendete Fehler (Live-Region, wird sofort vorgelesen) –
 * statische Warnungen, auch im Ton „danger“, sind eine Notiz und werden nicht beim Laden angesagt.
 */
export function Notice({ tone = "neutral", title, children, className, alert }: { tone?: "neutral" | "warn" | "danger" | "moss"; title?: string; children: ReactNode; className?: string; alert?: boolean }) {
  const t = {
    neutral: "bg-sunken",
    warn: "bg-warn-soft",
    danger: "bg-danger-soft",
    moss: "bg-moss-soft",
  }[tone];
  return (
    <div role={alert ? "alert" : "note"} className={cn("rounded-2xl px-4 py-3.5 text-sm", t, className)}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

/* ───────── Schwierigkeitsanzeige 1–5 ───────── */
export function Difficulty({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-label={`Schwierigkeit ${level} von 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-2.5 w-[5px] rounded-full", i <= level ? "bg-ink" : "bg-line-strong")} />
      ))}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-line-strong bg-card px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}
