import Form from "next/form";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bausteine für Verwaltungsansichten: dichte, ruhige Tabellen mit Haarlinien,
 * Mono-Kopfzeilen und GET-Filterleisten (funktionieren ohne JavaScript).
 */

export function AdminHeader({ n, title, description, actions }: { n?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
      <div>
        {n && <p className="spec mb-2 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />Abschnitt {n}</p>}
        <h1 className="display text-[2.1rem] sm:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Table({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cn("overflow-x-auto border-y border-line", className)}>
      <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, align, ...p }: ComponentProps<"th"> & { align?: "right" | "left" }) {
  return (
    <th
      scope="col"
      className={cn("spec h-9 whitespace-nowrap border-b border-line bg-sunken/60 px-3 text-left font-normal text-ink-2", align === "right" && "text-right", className)}
      {...p}
    />
  );
}

export function Td({ className, align, mono, ...p }: ComponentProps<"td"> & { align?: "right" | "left"; mono?: boolean }) {
  return <td className={cn("border-b border-line px-3 py-2.5 align-top", align === "right" && "text-right num", mono && "font-mono text-[12px]", className)} {...p} />;
}

export function Tr({ className, highlight, ...p }: ComponentProps<"tr"> & { highlight?: boolean }) {
  return <tr className={cn("hover:bg-sunken/50", highlight && "bg-clay-soft/40", className)} {...p} />;
}

/** GET-Filterleiste: Felder werden als Query-Parameter übertragen. */
export function FilterBar({ children, action, className }: { children: ReactNode; action?: string; className?: string }) {
  return (
    <Form action={action ?? ""} role="search" className={cn("mb-5 flex flex-wrap items-end gap-3", className)}>
      {children}
      <button type="submit" className="h-9 rounded-xl bg-moss px-4 text-[13px] font-semibold text-paper transition-colors hover:bg-moss-ink">
        Anwenden
      </button>
    </Form>
  );
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="spec">{label}</span>
      {children}
    </label>
  );
}

export const filterInput = "h-9 min-w-0 border border-line-strong bg-card px-2.5 text-[13.5px] text-ink focus:border-moss focus:outline-none rounded-2xl";

/** Segmentierte Status-Links (z.B. Offen · In Prüfung · Entschieden) mit Zählern. */
export function Segments({ items, active, className }: { items: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav aria-label="Filter" className={cn("mb-5 flex flex-wrap border border-line-strong w-fit rounded-2xl", className)}>
      {items.map((s, i) => (
        <Link
          key={s.key}
          href={s.href}
          aria-current={active === s.key ? "true" : undefined}
          className={cn("flex h-8 items-center gap-2 px-3 text-[13px] text-ink-2 hover:bg-sunken rounded-xl", i > 0 && "border-l border-line-strong", active === s.key && "bg-ink text-paper hover:bg-ink")}
        >
          {s.label}
          {s.count != null && <span className={cn("font-mono text-[11px]", active === s.key ? "text-paper/70" : "text-muted")}>{s.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Seiten" className="mt-5 flex items-center justify-between text-[13px]">
      <span className="spec">
        Seite {page} / {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? <Link className="border border-line-strong px-3 py-1.5 hover:border-rule-strong rounded-2xl" href={href(page - 1)}>← Zurück</Link> : <span className="border border-line px-3 py-1.5 text-muted/60 rounded-2xl">← Zurück</span>}
        {page < pages ? <Link className="border border-line-strong px-3 py-1.5 hover:border-rule-strong rounded-2xl" href={href(page + 1)}>Weiter →</Link> : <span className="border border-line px-3 py-1.5 text-muted/60 rounded-2xl">Weiter →</span>}
      </span>
    </nav>
  );
}

/** Kennzahl im Datenblatt-Stil mit optionaler Veränderung und Sparkline. */
export function Kpi({ label, value, note, delta, chart, restricted }: { label: string; value: ReactNode; note?: ReactNode; delta?: number | null; chart?: ReactNode; restricted?: boolean }) {
  return (
    <div className="flex min-h-[112px] flex-col justify-between border-l border-line px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <dt className="spec">{label}</dt>
        {restricted && <span className="spec text-clay-ink">Admin</span>}
      </div>
      <dd className="mt-2">
        <span className="text-[1.65rem] font-semibold leading-none tracking-tight num">{value}</span>
        {delta != null && Number.isFinite(delta) && (
          <span className={cn("ml-2 font-mono text-[11px]", delta > 0 ? "text-moss" : delta < 0 ? "text-clay-ink" : "text-muted")}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(Math.round(delta * 100))} %
          </span>
        )}
      </dd>
      <div className="mt-2 flex items-end justify-between gap-3">
        {note ? <span className="text-xs leading-snug text-muted">{note}</span> : <span />}
        {chart}
      </div>
    </div>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-1 gap-y-4 border-b border-line pb-5 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</dl>;
}

export function Dot({ tone }: { tone: "moss" | "clay" | "ink" | "muted" | "danger" | "warn" }) {
  const c = { moss: "bg-moss", clay: "bg-clay", ink: "bg-ink", muted: "bg-line-strong", danger: "bg-danger", warn: "bg-warn" }[tone];
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", c)} />;
}

/** Risikostufe als Balken mit 5 Segmenten (0–100). */
export function RiskMeter({ score }: { score: number }) {
  const level = Math.min(5, Math.max(1, Math.ceil(score / 20)));
  const tone = level >= 4 ? "bg-danger" : level === 3 ? "bg-clay" : "bg-ink";
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`Risiko ${score} von 100`}>
      <span className="inline-flex gap-[2px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("h-2.5 w-[5px]", i <= level ? tone : "bg-line-strong")} />
        ))}
      </span>
      <span className="font-mono text-[11px] num text-ink-2">{score}</span>
    </span>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
