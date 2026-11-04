import Link from "next/link";
import type { ArticleCardData } from "@/server/blog/service";
import { Avatar } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { cn, formatDate, pad } from "@/lib/utils";

/**
 * Artikelkarte in drei redaktionellen Formaten:
 * - `hero`: Aufmacher mit grossem Bild und Serif-Titel
 * - `card`: Rasterkarte (Standard)
 * - `row`: nummerierte Listenzeile ohne Bild
 */
export function ArticleCard({
  article: a,
  variant = "card",
  index,
  showAuthor = true,
  priority,
  className,
}: {
  article: ArticleCardData;
  variant?: "hero" | "card" | "row";
  index?: number;
  showAuthor?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const date = a.publishedAt ? formatDate(a.publishedAt, { day: "numeric", month: "long", year: "numeric" }) : null;
  const kicker = [a.category?.name, `${a.readingMinutes} Min.`].filter(Boolean).join(" · ");

  if (variant === "hero") {
    return (
      <article className={cn("group grid gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-10", className)}>
        <Link href={a.href} tabIndex={-1} aria-hidden className="crop block">
          <Cover url={a.coverUrl} alt="" seed={a.id} ratio="3/2" priority={priority} sizes="(min-width: 1024px) 680px, 100vw" className="border border-line rounded-2xl" label={a.title} />
        </Link>
        <div className="flex flex-col justify-end">
          <p className="spec flex items-center gap-2"><span className="inline-block h-px w-6 bg-clay" />Aufmacher · {kicker}</p>
          <h2 className="display mt-3 text-[2.25rem] text-balance sm:text-[2.9rem]">
            <Link href={a.href} className="ink-link">{a.title}</Link>
          </h2>
          {a.dek && <p className="mt-4 font-serif text-lg italic leading-snug text-ink-2 text-pretty">{a.dek}</p>}
          {showAuthor && (
            <p className="mt-6 flex items-center gap-3 border-t border-line pt-4 text-sm">
              <Avatar src={a.author.avatarUrl} name={a.author.displayName} size={32} />
              <span>
                <Link href={`/u/${a.author.handle}/blog`} className="font-semibold hover:underline">{a.author.displayName}</Link>
                {date && <span className="block text-xs text-muted"><time dateTime={a.publishedAt!}>{date}</time></span>}
              </span>
            </p>
          )}
        </div>
      </article>
    );
  }

  if (variant === "row") {
    return (
      <article className={cn("group flex gap-4 py-4", className)}>
        {index != null && <span className="w-6 shrink-0 pt-1 font-mono text-xs text-muted">{pad(index + 1)}</span>}
        <div className="min-w-0">
          {a.category && <p className="spec">{a.category.name}</p>}
          <h3 className="headline mt-0.5 text-[1.15rem] text-pretty">
            <Link href={a.href} className="group-hover:underline">{a.title}</Link>
          </h3>
          <p className="mt-1 text-xs text-muted">
            {showAuthor && <>{a.author.displayName} · </>}
            {a.readingMinutes} Min.
            {date && <> · <time dateTime={a.publishedAt!}>{date}</time></>}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("group flex flex-col", className)}>
      <Link href={a.href} tabIndex={-1} aria-hidden className="block">
        <Cover url={a.coverUrl} alt="" seed={a.id} ratio="3/2" sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" className="border border-line transition-colors group-hover:border-ink rounded-2xl" />
      </Link>
      <p className="spec mt-4">{kicker}</p>
      <h3 className="headline mt-1.5 text-[1.45rem] text-balance">
        <Link href={a.href} className="ink-link">{a.title}</Link>
      </h3>
      {a.dek && <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted">{a.dek}</p>}
      {showAuthor && (
        <p className="mt-auto flex items-center gap-2 pt-4 text-[13px]">
          <Avatar src={a.author.avatarUrl} name={a.author.displayName} size={22} />
          <Link href={`/u/${a.author.handle}/blog`} className="font-semibold hover:underline">{a.author.displayName}</Link>
          {date && <span className="text-muted">· <time dateTime={a.publishedAt!}>{date}</time></span>}
        </p>
      )}
    </article>
  );
}
