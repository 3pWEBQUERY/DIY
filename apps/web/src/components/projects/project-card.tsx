import Link from "next/link";
import type { ReactNode } from "react";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, VISIBILITY_LABEL, categoryBySlug } from "@werkraum/shared";
import type { ProjectCardData } from "@/server/projects/service";
import { BookOpen, Heart, Lock, MessageCircle, Repeat2 } from "lucide-react";
import { Cover } from "@/components/ui/media";
import { Avatar } from "@/components/ui/misc";
import { cn, compactNumber } from "@/lib/utils";
import { StatusMark } from "./status";

/** Kennzahl mit Symbol – nur sichtbar, wenn es etwas zu zählen gibt. */
function Metric({ icon: Icon, n, label }: { icon: typeof Heart; n: number; label: string }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1" title={label} aria-label={`${n} ${label}`}>
      <Icon size={13} strokeWidth={1.8} aria-hidden />
      <span className="num">{compactNumber(n)}</span>
    </span>
  );
}

/** Schwierigkeit als drei kleine Balken (1–2 / 3 / 4–5) plus Bezeichnung. */
function Difficulty({ level }: { level: number }) {
  const bars = level <= 2 ? 1 : level === 3 ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-full", i < bars ? "bg-ink-2" : "bg-line-strong")} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      {DIFFICULTY_LABEL[level] ?? `Stufe ${level}`}
    </span>
  );
}

const chip = "inline-flex h-6 items-center gap-1.5 rounded-full bg-card/92 px-2.5 text-[11.5px] font-medium leading-none text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)] backdrop-blur-sm";

/**
 * Projektkarte (Profil, Entdecken, Suche, Sammlungen): Das Bild ist die Karte – mit Status,
 * Sichtbarkeit und „Mit Anleitung“ dezent auf dem Bild. Darunter Titel, Kategorie und
 * Schwierigkeit, Autor:in und echte Zahlen (nur wenn vorhanden).
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
  const metrics = (
    <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-muted">
      <Metric icon={Heart} n={p.counts.likes} label="Gefällt mir" />
      <Metric icon={MessageCircle} n={p.counts.comments} label="Kommentare" />
      <Metric icon={Repeat2} n={p.counts.remixes} label="Nachbauten" />
    </span>
  );
  return (
    <article className={cn("group relative flex h-full min-w-0 flex-col", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-sunken">
        <Cover
          url={p.coverUrl}
          alt=""
          seed={p.id}
          category={p.category}
          ratio={ratio}
          plateNumber={false}
          className="rounded-none transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"
          priority={priority}
        />
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <span className={chip}>
            <StatusMark status={p.status} />
            {PROJECT_STATUS_LABEL[p.status]}
          </span>
          {p.visibility !== "PUBLIC" && (
            <span className={chip}>
              <Lock size={11} aria-hidden />
              {VISIBILITY_LABEL[p.visibility]}
            </span>
          )}
        </div>
        {p.counts.tutorials > 0 && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-ink/85 px-2.5 text-[11.5px] font-medium leading-none text-paper backdrop-blur-sm">
            <BookOpen size={12} aria-hidden /> Mit Anleitung
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-3">
        <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          <Link href={p.href} className="decoration-1 underline-offset-[3px] after:absolute after:inset-0 after:rounded-2xl group-hover:underline">
            {p.title}
          </Link>
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
          {cat && <span className="truncate">{cat.short}</span>}
          {cat && <span aria-hidden>·</span>}
          <Difficulty level={p.difficulty} />
        </p>
        {showAuthor ? (
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            <Link href={`/u/${p.owner.handle}`} className="relative z-10 flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink">
              <Avatar src={p.owner.avatarUrl} name={p.owner.displayName} size={20} />
              <span className="truncate">{p.owner.displayName}</span>
            </Link>
            {metrics}
          </div>
        ) : (
          (p.counts.likes > 0 || p.counts.comments > 0 || p.counts.remixes > 0) && <div className="mt-auto pt-2.5">{metrics}</div>
        )}
        {footer && <div className={cn("relative z-10 pt-3", !showAuthor && "mt-auto")}>{footer}</div>}
      </div>
    </article>
  );
}

/** Raster für Projektkarten (redaktionell, luftig). */
export function ProjectGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4", className)}>{children}</div>;
}
