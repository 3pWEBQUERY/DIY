import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, ArrowRight, PenLine } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { listArticles, resolveHandle } from "@/server/blog/service";
import { relationsFor } from "@/server/visibility";
import { Page } from "@/components/shell/page";
import { ArticleCard } from "@/components/blog/article-card";
import { FollowButton } from "@/components/social/actions";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { pluralize } from "@/lib/utils";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ nach?: string; tag?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const h = await resolveHandle(handle);
  if (!h || h.kind !== "ok") return { title: "Blog" };
  const title = `Blog von ${h.profile.displayName}`;
  return {
    title,
    description: h.profile.bio?.slice(0, 160) || `Artikel und Werkstattberichte von ${h.profile.displayName}.`,
    alternates: { canonical: `/u/${h.profile.handle}/blog` },
    openGraph: { title, type: "profile" },
  };
}

export default async function UserBlogPage({ params, searchParams }: Props) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const h = await resolveHandle(handle);
  if (!h) notFound();
  if (h.kind === "redirect") permanentRedirect(`/u/${h.handle}/blog`);
  const author = h.profile;
  const viewer = await currentUser();
  const viewerId = viewer?.id ?? null;
  if (viewerId && viewerId !== author.userId) {
    const rel = await relationsFor(viewerId);
    if (rel.blocked.includes(author.userId)) notFound();
  }
  const isSelf = viewerId === author.userId;
  const rel = viewerId ? await relationsFor(viewerId) : null;
  const res = await listArticles({ authorId: author.userId, tag: sp.tag, viewerId, take: 13 }, sp.nach);
  const lead = sp.nach ? null : (res.items[0] ?? null);
  const rest = sp.nach ? res.items : res.items.slice(1);
  const tagCounts = new Map<string, number>();
  res.items.forEach((a) => a.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <Page width="wide">
      <Link href={`/u/${author.handle}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Profil von {author.displayName}
      </Link>
      <header className="mb-12 grid gap-6 border-b border-ink pb-8 md:grid-cols-[auto_1fr_auto] md:items-end">
        <Avatar src={author.avatarUrl} name={author.displayName} size={88} />
        <div>
          <p className="spec flex items-center gap-2"><span className="inline-block h-px w-6 bg-ink" />Blog · @{author.handle}</p>
          <h1 className="display mt-2 text-[2.6rem] sm:text-6xl">{author.displayName}</h1>
          {author.bio && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted text-pretty">{author.bio}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="spec">{pluralize(author.followerCount, "Follower:in", "Follower")}</span>
          {isSelf ? (
            <LinkButton href="/studio/blog/neu" variant="outline" size="sm"><PenLine size={14} /> Neuer Artikel</LinkButton>
          ) : viewer ? (
            <FollowButton userId={author.userId} following={!!rel?.following.includes(author.userId)} size="sm" />
          ) : null}
        </div>
      </header>

      {topTags.length > 0 && (
        <nav aria-label="Schlagwörter" className="-mt-6 mb-10 flex flex-wrap gap-2">
          {sp.tag && <Link href={`/u/${author.handle}/blog`} className="inline-flex h-7 items-center border border-ink bg-ink px-2.5 font-mono text-[11px] text-paper">#{sp.tag} ×</Link>}
          {topTags.filter(([t]) => t !== sp.tag).map(([t]) => (
            <Link key={t} href={`/u/${author.handle}/blog?tag=${t}`} className="inline-flex h-7 items-center border border-line-strong px-2.5 font-mono text-[11px] text-ink-2 hover:border-ink">#{t}</Link>
          ))}
        </nav>
      )}

      {res.items.length === 0 ? (
        <Empty
          title={isSelf ? "Dein Blog wartet" : "Noch keine Artikel"}
          body={isSelf ? "Schreib über ein Projekt, eine Technik oder dein Lieblingsmaterial." : `${author.displayName} hat noch nichts veröffentlicht.`}
          action={isSelf ? <LinkButton href="/studio/blog/neu">Ersten Artikel schreiben</LinkButton> : undefined}
        />
      ) : (
        <>
          {lead && <ArticleCard article={lead} variant="hero" showAuthor={false} priority />}
          {rest.length > 0 && (
            <section aria-labelledby="alle" className={lead ? "mt-16" : undefined}>
              <SectionTitle n="01" title={<span id="alle">{sp.tag ? `Artikel mit #${sp.tag}` : "Alle Artikel"}</span>} />
              <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <ArticleCard key={a.id} article={a} showAuthor={false} />
                ))}
              </div>
            </section>
          )}
          {res.nextCursor && (
            <div className="mt-12 flex justify-center">
              <LinkButton href={`/u/${author.handle}/blog?${new URLSearchParams({ ...(sp.tag ? { tag: sp.tag } : {}), nach: res.nextCursor })}`} variant="outline">
                Ältere Artikel <ArrowRight size={14} />
              </LinkButton>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
