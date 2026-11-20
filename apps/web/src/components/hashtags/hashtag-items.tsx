"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import type { PostView } from "@/server/social/posts";
import type { ProjectCardData } from "@/server/projects/service";
import type { TutorialCardData } from "@/server/tutorials/service";
import type { ArticleCardData } from "@/server/blog/service";
import type { ProductCardData } from "@/server/commerce/products";
import type { HashtagComment, HashtagKind } from "@/server/hashtags/service";
import { PostCard } from "@/components/social/post-card";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard, TutorialGrid } from "@/components/tutorials/tutorial-card";
import { ArticleCard } from "@/components/blog/article-card";
import { ProductGrid } from "@/components/commerce/product-card";
import { Avatar } from "@/components/ui/misc";
import { RelativeTime } from "@/components/ui/relative-time";
import { Linkified } from "@/components/ui/linkify";
import { loadHashtagAction } from "@/app/(app)/hashtag/actions";
import { callData } from "@/lib/use-action";
import { usePagedList } from "@/lib/use-paged-list";
import { toast } from "@/components/ui/toast";

export type HashtagViewer = { id: string; displayName: string; avatarUrl: string | null } | null;

type Item = { id: string };

/** Treffer einer Art mit den Karten, die auch Feed, Listen und Marktplatz verwenden. */
export function HashtagItems({ kind, items, viewer }: { kind: HashtagKind; items: Item[]; viewer: HashtagViewer }) {
  switch (kind) {
    case "post":
      return (
        <div className="-mx-1">
          {(items as PostView[]).map((p) => (
            <PostCard key={p.id} post={p} viewer={viewer} />
          ))}
        </div>
      );
    case "project":
      return (
        <ProjectGrid>
          {(items as ProjectCardData[]).map((p, i) => (
            <ProjectCard key={p.id} project={p} priority={i < 4} />
          ))}
        </ProjectGrid>
      );
    case "tutorial":
      return (
        <TutorialGrid>
          {(items as TutorialCardData[]).map((t, i) => (
            <TutorialCard key={t.id} tutorial={t} priority={i < 3} />
          ))}
        </TutorialGrid>
      );
    case "article":
      return (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {(items as ArticleCardData[]).map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      );
    case "product":
      return <ProductGrid products={items as ProductCardData[]} />;
    case "comment":
      return (
        <ul className="divide-y divide-line border-y border-line">
          {(items as HashtagComment[]).map((c) => (
            <CommentHit key={c.id} c={c} />
          ))}
        </ul>
      );
  }
}

function CommentHit({ c }: { c: HashtagComment }) {
  return (
    <li className="flex gap-3 py-4">
      <Link href={`/u/${c.author.handle}`} className="shrink-0" aria-hidden tabIndex={-1}>
        <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-muted">
          <Link href={`/u/${c.author.handle}`} className="font-semibold text-ink hover:underline">
            {c.author.displayName}
          </Link>{" "}
          · <RelativeTime date={c.createdAt} />
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-2">
          <Linkified text={c.body} links={false} />
        </p>
        <Link href={c.target.href} className="spec mt-2 inline-block truncate text-ink-2 hover:text-ink">
          {c.target.label}: {c.target.title}
        </Link>
      </div>
    </li>
  );
}

/** Treffer einer Art mit Nachladen beim Scrollen (Fallback: Knopf). */
export function HashtagList({ tag, kind, slug, initial, cursor: initialCursor, viewer }: { tag: string; kind: HashtagKind; slug: string; initial: Item[]; cursor: string | null; viewer: HashtagViewer }) {
  const { items, cursor, append } = usePagedList(initial, initialCursor, `${tag}:${kind}`);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  const more = () => {
    if (!cursor || pending) return;
    start(async () => {
      const r = await callData(() => loadHashtagAction(tag, slug, cursor));
      if (!r.ok) return void toast(r.error, "error");
      append(r.data.items as Item[], r.data.nextCursor);
    });
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && more(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  return (
    <div>
      <HashtagItems kind={kind} items={items} viewer={viewer} />
      <div ref={sentinel} />
      {cursor && (
        <button type="button" onClick={more} disabled={pending} className="mt-10 w-full rounded-2xl border border-line py-3 text-sm font-semibold text-muted hover:border-rule-strong hover:text-ink">
          {pending ? "Lädt …" : "Mehr laden"}
        </button>
      )}
    </div>
  );
}
