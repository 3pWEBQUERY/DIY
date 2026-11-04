import Link from "next/link";
import type { ReactNode } from "react";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, VISIBILITY_LABEL, categoryBySlug } from "@werkraum/shared";
import type { ProjectCardData } from "@/server/projects/service";
import { Cover } from "@/components/ui/media";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { StatusMark } from "./status";

/**
 * Projektkarte (wiederverwendbar für Profil, Entdecken, Suche, Sammlungen).
 * Cover bzw. Tafel, Datenblatt-Zeile in Mono, Titel in Serif, Autor:in.
 * Funktioniert in Server- und Client-Komponenten (keine Hooks).
 */
export function ProjectCard({
  project: p,
  showAuthor = true,
  priority,
  ratio = "4/5",
  className,
  footer,
}: {
  project: ProjectCardData;
  showAuthor?: boolean;
  priority?: boolean;
  ratio?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const cat = categoryBySlug(p.category);
  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong",
        className,
      )}
    >
      <Link href={p.href} className="block">
        <div className="relative">
          <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio={ratio} className="rounded-none" sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw" priority={priority} label={p.coverUrl ? undefined : p.title} />
          {p.counts.tutorials > 0 && (
            <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-paper">Mit Anleitung</span>
          )}
          {p.visibility !== "PUBLIC" && (
            <span className="absolute right-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-2">
              {VISIBILITY_LABEL[p.visibility]}
            </span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <Link href={p.href} className="block">
          <p className="spec flex min-w-0 items-center gap-1.5">
            <StatusMark status={p.status} />
            <span className="truncate">
              {PROJECT_STATUS_LABEL[p.status]}
              {cat ? ` · ${cat.short}` : ""} · {DIFFICULTY_LABEL[p.difficulty] ?? `Stufe ${p.difficulty}`}
            </span>
          </p>
          <h3 className="headline mt-1.5 line-clamp-2 min-h-[2lh] text-[1.2rem] decoration-1 underline-offset-[5px] group-hover:underline">{p.title}</h3>
        </Link>
        {showAuthor && (
          <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-[13px] text-muted">
            <Link href={`/u/${p.owner.handle}`} className="flex min-w-0 items-center gap-2 hover:text-ink">
              <Avatar src={p.owner.avatarUrl} name={p.owner.displayName} size={22} />
              <span className="truncate">{p.owner.displayName}</span>
            </Link>
            <span className="shrink-0 font-mono text-[11px] num">
              {p.counts.updates > 0 ? `${p.counts.updates} ${p.counts.updates === 1 ? "Eintrag" : "Einträge"}` : ""}
              {p.counts.remixes > 0 ? `${p.counts.updates > 0 ? " · " : ""}${p.counts.remixes} Nachb.` : ""}
            </span>
          </div>
        )}
        {footer && <div className={cn("pt-3", !showAuthor && "mt-auto")}>{footer}</div>}
      </div>
    </article>
  );
}

/** Raster für Projektkarten (redaktionell, luftig). */
export function ProjectGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4", className)}>{children}</div>;
}
