import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Seitenraster: Hauptinhalt + optionale rechte Kontextspalte.
 * `width`: feed (Lesespalte), wide (Raster), full.
 */
export function Page({
  children,
  aside,
  width = "feed",
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  width?: "feed" | "wide" | "full" | "narrow";
  className?: string;
}) {
  const w = { narrow: "max-w-[560px]", feed: "max-w-[660px]", wide: "max-w-[1200px]", full: "max-w-none" }[width];
  if (!aside) {
    return <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 md:py-10 lg:px-10", w, className)}>{children}</div>;
  }
  return (
    <div className={cn("mx-auto flex w-full max-w-[1120px] gap-10 px-4 py-6 sm:px-6 md:py-10 lg:px-10", className)}>
      <div className={cn("min-w-0 flex-1", w)}>{children}</div>
      <aside className="sticky top-10 hidden h-fit w-[300px] shrink-0 lg:block" aria-label="Kontext">
        {aside}
      </aside>
    </div>
  );
}

/** Seitenkopf im Werkbuch-Stil: Kicker (mono), Serif-Titel, Beschreibung, Aktionen. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("mb-8", className)}>
      {kicker && <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />{kicker}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[2.4rem] text-balance sm:text-5xl">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted text-pretty">{description}</p>}
      {children}
    </header>
  );
}

/** Tabs als Links (serverseitig, barrierefrei, ohne JS). */
export function TabLinks({ tabs, active, className }: { tabs: { href: string; label: string; count?: number; key: string }[]; active: string; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-6 overflow-x-auto border-b border-line scrollbar-none", className)}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          scroll={false}
          role="tab"
          aria-selected={active === t.key}
          href={t.href}
          className={cn(
            "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent py-3 text-[14px] text-muted transition-colors hover:text-ink",
            active === t.key && "border-moss font-semibold text-ink",
          )}
        >
          {t.label}
          {t.count != null && <span className="font-mono text-[11px] text-muted">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
