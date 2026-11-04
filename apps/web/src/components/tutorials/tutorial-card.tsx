import Link from "next/link";
import type { ReactNode } from "react";
import { SAFETY_LABEL, categoryBySlug, formatMoney } from "@werkraum/shared";
import type { TutorialCardData } from "@/server/tutorials/service";
import { Cover } from "@/components/ui/media";
import { Avatar, Difficulty } from "@/components/ui/misc";
import { cn, formatMinutes } from "@/lib/utils";

/**
 * Anleitungskarte (wiederverwendbar). Datenblatt-Zeile: Kategorie · Schritte · Dauer,
 * Schwierigkeit als Balken, Sicherheitskategorien klar ausgewiesen.
 */
export function TutorialCard({ tutorial: t, showAuthor = true, priority, className, footer }: { tutorial: TutorialCardData; showAuthor?: boolean; priority?: boolean; className?: string; footer?: ReactNode }) {
  const cat = categoryBySlug(t.category);
  return (
    <article className={cn("group relative min-w-0", className)}>
      <Link href={t.href} className="block">
        <div className="relative border border-line transition-colors duration-200 group-hover:border-ink rounded-2xl">
          <Cover url={t.coverUrl} alt="" seed={`t-${t.id}`} category={t.category} ratio="3/2" sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" priority={priority} />
          <span className="absolute left-0 top-0 border-b border-r border-line bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink">
            Anleitung{t.version && t.version > 1 ? ` · v${t.version}` : ""}
          </span>
          {t.state !== "PUBLISHED" && (
            <span className="absolute right-0 top-0 bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-paper rounded-2xl">Entwurf</span>
          )}
        </div>
        <p className="spec mt-3 truncate">
          {cat?.short ?? "Anleitung"} · {t.steps} {t.steps === 1 ? "Schritt" : "Schritte"} · {formatMinutes(t.minutes)}
        </p>
        <h3 className="headline mt-1.5 text-[1.28rem] text-balance decoration-1 underline-offset-[5px] group-hover:underline">{t.title}</h3>
        {t.summary && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">{t.summary}</p>}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <Difficulty level={t.difficulty} />
        <span className="spec text-ink-2">{t.isPaid && t.priceMinor ? formatMoney(t.priceMinor) : "Kostenlos"}</span>
      </div>
      {t.safetyKinds.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-warn">
          <span aria-hidden className="mt-[5px] inline-block size-1.5 shrink-0 rotate-45 bg-warn rounded-full" />
          <span>
            <span className="sr-only">Sicherheitshinweise: </span>
            {t.safetyKinds.map((k) => SAFETY_LABEL[k]).join(" · ")}
          </span>
        </p>
      )}
      {showAuthor && (
        <Link href={`/u/${t.author.handle}`} className="mt-2.5 flex min-w-0 items-center gap-2 text-[13px] text-muted hover:text-ink">
          <Avatar src={t.author.avatarUrl} name={t.author.displayName} size={20} />
          <span className="truncate">{t.author.displayName}</span>
          {t.counts.completions > 0 && <span className="ml-auto shrink-0 font-mono text-[11px] num">{t.counts.completions}× nachgebaut</span>}
        </Link>
      )}
      {footer}
    </article>
  );
}

export function TutorialGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}
