import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowUpRight, Pencil } from "lucide-react";
import { PROJECT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { articleBaseUrl, articleHref, getArticleForReader, linkedProjects, recordArticleView, relatedArticles } from "@/server/blog/service";
import { ArticleRenderer, articleOutline } from "@/components/blog/article-renderer";
import { ArticleActions } from "@/components/blog/article-actions";
import { ArticleCard } from "@/components/blog/article-card";
import { Comments } from "@/components/social/comments";
import { FollowButton } from "@/components/social/actions";
import { Avatar, Notice, SectionTitle } from "@/components/ui/misc";
import { Cover, Plate } from "@/components/ui/media";
import { LinkButton } from "@/components/ui/button";
import { formatDate, pluralize } from "@/lib/utils";
import { BRAND } from "@/config/brand";

type Props = { params: Promise<{ handle: string; slug: string }> };

const readArticle = cache((handle: string, slug: string, viewerId: string | null) => getArticleForReader(handle, slug, viewerId));

async function load(p: Props["params"]) {
  const { handle, slug } = await p;
  const viewer = await currentUser();
  const res = await readArticle(handle, slug, viewer?.id ?? null);
  return { res, viewer };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { res } = await load(params);
  if (!res || res.kind !== "ok") return { title: "Artikel", robots: { index: false } };
  const a = res.article;
  const url = articleHref(res.author.handle, a.slug);
  const title = a.seoTitle || a.title;
  const description = (a.seoDescription || a.dek || a.plainText).slice(0, 170);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: res.isLive ? undefined : { index: false, follow: false },
    authors: [{ name: res.author.displayName, url: `/u/${res.author.handle}` }],
    keywords: a.tags,
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: BRAND.name,
      locale: "de_CH",
      publishedTime: a.publishedAt?.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      authors: [`/u/${res.author.handle}`],
      section: a.category?.name,
      tags: a.tags,
      images: a.coverUrl ? [{ url: a.coverUrl, alt: a.title }] : undefined,
    },
    twitter: { card: a.coverUrl ? "summary_large_image" : "summary", title, description },
  };
}

function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export default async function ArticlePage({ params }: Props) {
  const { res, viewer } = await load(params);
  if (!res) notFound();
  if (res.kind === "redirect") permanentRedirect(res.to);
  const { article: a, author, isAuthor, isLive } = res;
  const viewerId = viewer?.id ?? null;
  const href = articleHref(author.handle, a.slug);
  const base = articleBaseUrl();
  const outline = articleOutline(a.blocks).filter((o) => o.level === 2);
  const [related, projects] = await Promise.all([
    isLive ? relatedArticles(a, viewerId) : Promise.resolve([]),
    linkedProjects(a.projects.map((p) => p.projectId)),
  ]);
  if (isLive && !isAuthor) after(() => recordArticleView(a.id));
  const viewerLite = viewer?.profile ? { id: viewer.id, displayName: viewer.profile.displayName, avatarUrl: viewer.profile.avatarUrl } : null;
  const published = a.publishedAt ? formatDate(a.publishedAt, { day: "numeric", month: "long", year: "numeric" }) : null;
  const edited = a.publishedAt && a.updatedAt.getTime() - a.publishedAt.getTime() > 86400_000 ? formatDate(a.updatedAt, { day: "numeric", month: "long", year: "numeric" }) : null;

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title.slice(0, 110),
    description: a.seoDescription || a.dek || undefined,
    image: a.coverUrl ? [a.coverUrl.startsWith("http") ? a.coverUrl : `${base}${a.coverUrl}`] : undefined,
    datePublished: a.publishedAt?.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    wordCount: a.plainText.split(/\s+/).filter(Boolean).length,
    timeRequired: `PT${a.readingMinutes}M`,
    inLanguage: "de-CH",
    keywords: a.tags.join(", ") || undefined,
    articleSection: a.category?.name,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${base}${href}` },
    url: `${base}${href}`,
    author: { "@type": "Person", name: author.displayName, url: `${base}/u/${author.handle}` },
    publisher: { "@type": "Organization", name: BRAND.name, url: base },
    interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: a.likeCount }],
  };

  return (
    <div className="px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      {isLive && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />}

      {!isLive && isAuthor && (
        <Notice tone="warn" className="mx-auto mb-8 max-w-[1100px]" title={a.state === "SCHEDULED" ? "Vorschau · geplant" : a.state === "HIDDEN" ? "Ausgeblendet" : "Vorschau · Entwurf"}>
          {a.state === "SCHEDULED" && a.publishedAt
            ? `Dieser Artikel erscheint am ${formatDate(a.publishedAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Nur du siehst diese Seite.`
            : a.state === "HIDDEN"
              ? "Die Moderation hat diesen Artikel ausgeblendet. Nur du siehst diese Seite."
              : "Nur du siehst diese Seite."}{" "}
          <Link href={`/studio/blog/${a.id}`} className="font-semibold underline underline-offset-2">Weiter bearbeiten</Link>
        </Notice>
      )}

      <article className="mx-auto max-w-[1100px]" aria-labelledby="article-title">
        <header className="mx-auto max-w-[760px] text-center">
          <p className="spec flex items-center justify-center gap-2">
            <Link href="/blogs" className="hover:text-ink">Blogs</Link>
            <span aria-hidden>·</span>
            {a.category ? <Link href={`/blogs?rubrik=${a.category.slug}`} className="hover:text-ink">{a.category.name}</Link> : <span>Artikel</span>}
            <span aria-hidden>·</span>
            <span>{a.readingMinutes} Min. Lesezeit</span>
          </p>
          <h1 id="article-title" className="display mt-5 text-[2.5rem] text-balance sm:text-[3.6rem]">{a.title}</h1>
          {a.dek && <p className="mx-auto mt-5 max-w-[640px] font-serif text-[1.3rem] italic leading-snug text-ink-2 text-pretty">{a.dek}</p>}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
            <Link href={`/u/${author.handle}`} className="flex items-center gap-2">
              <Avatar src={author.avatarUrl} name={author.displayName} size={30} />
              <span className="font-semibold hover:underline">{author.displayName}</span>
            </Link>
            {published && (
              <>
                <span className="text-line-strong" aria-hidden>|</span>
                <span className="text-muted">
                  <time dateTime={a.publishedAt!.toISOString()}>{published}</time>
                  {edited && <> · aktualisiert {edited}</>}
                </span>
              </>
            )}
            {isAuthor && (
              <Link href={`/studio/blog/${a.id}`} className="inline-flex items-center gap-1 text-muted hover:text-ink">
                <Pencil size={13} /> Bearbeiten
              </Link>
            )}
          </div>
        </header>

        {a.coverUrl && (
          <figure className="crop -mx-4 mt-10 sm:mx-0">
            <Cover url={a.coverUrl} alt={a.title} seed={a.id} ratio="16/9" priority sizes="(min-width: 1100px) 1100px, 100vw" />
          </figure>
        )}

        <div className="mt-12 grid gap-10 xl:grid-cols-[1fr_minmax(0,720px)_1fr]">
          <div className="hidden xl:block" />
          <div className="min-w-0">
            <ArticleRenderer blocks={a.blocks} viewerId={viewerId} />

            {a.tags.length > 0 && (
              <ul className="mt-12 flex flex-wrap gap-2" aria-label="Schlagwörter">
                {a.tags.map((t) => (
                  <li key={t}>
                    <Link href={`/blogs?tag=${t}`} className="inline-flex h-7 items-center border border-line-strong px-2.5 font-mono text-[11px] text-ink-2 hover:border-ink rounded-xl">#{t}</Link>
                  </li>
                ))}
              </ul>
            )}

            {isLive && (
              <div className="mt-8 border-y border-line py-4">
                <ArticleActions articleId={a.id} liked={res.viewer.liked} likes={a.likeCount} saved={res.viewer.saved} url={href} title={a.title} canReport={!!viewer && !isAuthor} commentCount={a.commentsEnabled ? res.commentCount : undefined} />
              </div>
            )}

            {/* Autorenbox */}
            <section aria-label="Über die Autorin / den Autor" className="mt-10 grid grid-cols-[auto_1fr] gap-5 border border-line bg-card p-6 rounded-2xl">
              <Link href={`/u/${author.handle}`}><Avatar src={author.avatarUrl} name={author.displayName} size={64} /></Link>
              <div className="min-w-0">
                <p className="spec">Geschrieben von</p>
                <p className="headline mt-1 text-xl"><Link href={`/u/${author.handle}`} className="hover:underline">{author.displayName}</Link></p>
                {author.bio && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{author.bio}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {viewer && !isAuthor && <FollowButton userId={author.userId} following={res.viewer.following} size="sm" />}
                  <Link href={`/u/${author.handle}/blog`} className="text-sm font-semibold hover:underline">Alle Artikel</Link>
                  <span className="spec">{pluralize(author.followerCount, "Follower:in", "Follower")}</span>
                </div>
              </div>
            </section>

            {projects.length > 0 && (
              <section aria-labelledby="proj" className="mt-12">
                <SectionTitle n="01" title={<span id="proj">Projekte zu diesem Artikel</span>} />
                <ul className="mt-5 space-y-3 border-l border-ink pl-5">
                  {projects.map((p) => (
                    <li key={p.id} className="relative">
                      <span className="absolute -left-[23.5px] top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-ink" aria-hidden />
                      <Link href={p.href} className="group flex items-stretch border border-line bg-card hover:border-ink rounded-2xl">
                        <span className="relative w-20 shrink-0 overflow-hidden border-r border-line">
                          {p.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            <Plate seed={p.id} category={p.category} number={false} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 px-4 py-3">
                          <span className="spec">Projekt · {PROJECT_STATUS_LABEL[p.status]}</span>
                          <span className="block truncate font-semibold">{p.title}</span>
                          <span className="text-xs text-muted">{categoryBySlug(p.category)?.name}</span>
                        </span>
                        <ArrowUpRight size={16} className="m-3 shrink-0 text-muted group-hover:text-ink" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {isLive && (
              <section id="kommentare" aria-labelledby="komm" className="mt-12 scroll-mt-24">
                <SectionTitle n={projects.length ? "02" : "01"} title={<span id="komm">Kommentare{a.commentsEnabled && res.commentCount ? ` (${res.commentCount})` : ""}</span>} />
                <div className="mt-6">
                  {a.commentsEnabled ? (
                    <Comments targetType="ARTICLE" targetId={a.id} viewer={viewerLite} placeholder="Was denkst du dazu?" />
                  ) : (
                    <p className="text-sm text-muted">Kommentare sind für diesen Artikel deaktiviert.</p>
                  )}
                </div>
              </section>
            )}
          </div>

          {outline.length >= 3 ? (
            <nav aria-label="Inhalt" className="hidden xl:block">
              <div className="sticky top-10 border-l border-line pl-5">
                <p className="spec mb-3">Inhalt</p>
                <ol className="space-y-2 text-[13px]">
                  {outline.map((o, i) => (
                    <li key={o.anchor} className="flex gap-2">
                      <span className="font-mono text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <a href={`#${o.anchor}`} className="text-ink-2 hover:text-ink hover:underline">{o.text}</a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
          ) : (
            <div className="hidden xl:block" />
          )}
        </div>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="weiter" className="mx-auto mt-20 max-w-[1100px]">
          <SectionTitle title={<span id="weiter">Weiterlesen</span>} action={<Link href="/blogs" className="text-xs text-muted hover:text-ink">Alle Blogs</Link>} />
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <ArticleCard key={r.id} article={r} />
            ))}
          </div>
        </section>
      )}

      {!viewer && isLive && (
        <div className="mx-auto mt-16 flex max-w-[1100px] flex-wrap items-center justify-between gap-4 border-t border-ink pt-6">
          <p className="headline text-xl">Folge {author.displayName} und verpasse keinen Werkstattbericht.</p>
          <LinkButton href={`/registrieren?weiter=${encodeURIComponent(href)}`} variant="ink">Kostenlos mitmachen</LinkButton>
        </div>
      )}
    </div>
  );
}
