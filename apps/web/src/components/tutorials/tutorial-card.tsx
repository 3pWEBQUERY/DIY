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
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong",
        className,
      )}
    >
      <Link href={t.href} className="block">
        <div className="relative">
          <Cover url={t.coverUrl} alt="" seed={`t-${t.id}`} category={t.category} ratio="3/2" className="rounded-none" plateNumber={false} sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" priority={priority} />
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">
            Anleitung{t.version && t.version > 1 ? ` · v${t.version}` : ""}
          </span>
          {t.state !== "PUBLISHED" && (
            <span className="absolute right-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-paper">Entwurf</span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <Link href={t.href} className="block">
          <p className="spec truncate">
            {cat?.short ?? "Anleitung"} · {t.steps} {t.steps === 1 ? "Schritt" : "Schritte"} · {formatMinutes(t.minutes)}
          </p>
          <h3 className="headline mt-1.5 line-clamp-2 min-h-[2lh] text-[1.2rem] decoration-1 underline-offset-[5px] group-hover:underline">{t.title}</h3>
          <p className="mt-1.5 line-clamp-2 min-h-[2lh] text-[14px] leading-relaxed text-muted">{t.summary}</p>
        </Link>
        <p className="mt-2 flex min-h-[1lh] items-start gap-1.5 text-[12px] leading-snug text-warn">
          {t.safetyKinds.length > 0 && (
            <>
              <span aria-hidden className="mt-[5px] inline-block size-1.5 shrink-0 rounded-full bg-warn" />
              <span className="line-clamp-1">
                <span className="sr-only">Sicherheitshinweise: </span>
                {t.safetyKinds.map((k) => SAFETY_LABEL[k]).join(" · ")}
              </span>
            </>
          )}
        </p>
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <Difficulty level={t.difficulty} />
            <span className="spec text-ink-2">{t.isPaid && t.priceMinor ? formatMoney(t.priceMinor) : "Kostenlos"}</span>
          </div>
          {showAuthor && (
            <Link href={`/u/${t.author.handle}`} className="mt-3 flex min-w-0 items-center gap-2 text-[13px] text-muted hover:text-ink">
              <Avatar src={t.author.avatarUrl} name={t.author.displayName} size={22} />
              <span className="truncate">{t.author.displayName}</span>
              {t.counts.completions > 0 && <span className="ml-auto shrink-0 font-mono text-[11px] num">{t.counts.completions}× nachgebaut</span>}
            </Link>
          )}
          {footer && <div className="pt-3">{footer}</div>}
        </div>
      </div>
    </article>
  );
}

export function TutorialGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}
