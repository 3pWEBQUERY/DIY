"use client";

import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { MessageCircle, Repeat2, Pencil, Trash2, ArrowUpRight, Users, LogOut } from "lucide-react";
import { CoauthorDialog, leaveCoauthor } from "./coauthor-dialog";
import { PROJECT_STATUS_LABEL, categoryBySlug, formatMoney, type Currency } from "@werkraum/shared";
import type { PostView } from "@/server/social/posts";
import { Avatar, Badge } from "@/components/ui/misc";
import { MediaImage, Plate } from "@/components/ui/media";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn, compactNumber, smoothScroll } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/relative-time";
import { LikeButton, SaveButton, ShareButton, MoreMenu, useSafetyMenu, type MenuItem } from "./actions";
import { Comments } from "./comments";
import { PollBlock } from "./poll";
import { deletePostAction, repostAction, updatePostAction } from "@/app/(app)/social-actions";
import { useRouter } from "next/navigation";
import { VideoPlayer } from "@/components/media/video";
import { callAction } from "@/lib/use-action";

const KIND_LABEL: Partial<Record<string, string>> = {
  PROJECT_UPDATE: "Fortschritt",
  PROJECT_SHOWCASE: "Projekt",
  TUTORIAL: "Anleitung",
  ARTICLE: "Artikel",
  PRODUCT: "Verkauf",
  REPOST: "Geteilt",
};

/** @handle als Links, Zeilenumbrüche erhalten. Kein HTML-Rendering (XSS-sicher). */
export function RichText({ text, className }: { text: string; className?: string }) {
  // Handles enden nie auf Punkt/Unterstrich; Satzzeichen am Ende gehören weder zum Handle noch zur URL
  const parts = text.split(/(@[a-z0-9][a-z0-9._]{1,22}[a-z0-9]|https?:\/\/[^\s]+?(?=[.,;:!?)\]]*(?:\s|$)))/gi);
  return (
    <p className={cn("whitespace-pre-line text-pretty", className)}>
      {parts.map((p, i) =>
        i % 2 === 1 && p.startsWith("@") ? (
          <Link key={i} href={`/u/${p.slice(1).toLowerCase()}`} className="font-semibold text-moss hover:underline">
            {p}
          </Link>
        ) : i % 2 === 1 && /^https?:\/\//.test(p) ? (
          <a key={i} href={p} rel="nofollow noopener ugc" target="_blank" className="text-moss underline underline-offset-2 break-all">
            {p.replace(/^https?:\/\//, "").slice(0, 40)}
            {p.length > 48 ? "…" : ""}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  );
}

function Gallery({ media, postId }: { media: PostView["media"]; postId: string }) {
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  if (!media.length) return null;
  if (media.length === 1) {
    const m = media[0]!;
    const ratio = m.width && m.height ? Math.min(Math.max(m.width / m.height, 0.8), 1.78) : 4 / 3;
    return (
      <div className="relative overflow-hidden rounded-2xl bg-sunken" style={{ aspectRatio: ratio }}>
        {m.kind === "VIDEO" ? (
          <VideoPlayer variants={m.variants} alt={m.alt} />
        ) : (
          <MediaImage variants={m.variants} alt={m.alt} className="absolute inset-0" />
        )}
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        ref={track}
        onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none"
        aria-roledescription="Karussell"
        aria-label={`${media.length} Medien`}
      >
        {media.map((m, i) => (
          <div key={m.id} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-sunken" aria-roledescription="Folie" aria-label={`${i + 1} von ${media.length}`}>
            {m.kind === "VIDEO" ? (
              <VideoPlayer variants={m.variants} alt={m.alt} />
            ) : (
              <MediaImage variants={m.variants} alt={m.alt} className="absolute inset-0" />
            )}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 bg-ink/85 px-2 py-0.5 font-mono text-[11px] text-paper rounded-2xl" aria-hidden>
        {String(idx + 1).padStart(2, "0")} / {String(media.length).padStart(2, "0")}
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {media.map((m, i) => (
          <button
            key={`${postId}-${m.id}`}
            type="button"
            aria-label={`Medium ${i + 1}`}
            onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: smoothScroll() })}
            className={cn("h-[3px] w-5 bg-paper/60", i === idx && "bg-paper")}
          />
        ))}
      </div>
    </div>
  );
}

/** Projektfaden-Verknüpfung: Der Beitrag hängt sichtbar an seinem Projekt (§1.3). */
function ProjectLink({ p }: { p: NonNullable<PostView["project"]> }) {
  return (
    <Link href={`/u/${p.ownerHandle}/${p.slug}`} className="group relative mt-3 flex items-stretch border border-line bg-card transition-colors hover:border-rule-strong rounded-2xl">
            <div className="relative w-20 shrink-0 overflow-hidden rounded-l-2xl border-r border-line">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Plate seed={p.id} category={p.category} number={false} />
        )}
      </div>
      <div className="min-w-0 flex-1 px-3.5 py-2.5">
        <p className="spec">Projekt · {PROJECT_STATUS_LABEL[p.status]}</p>
        <p className="mt-0.5 truncate text-[15px] font-semibold">{p.title}</p>
        <p className="text-xs text-muted">{categoryBySlug(p.category)?.name}</p>
      </div>
      <ArrowUpRight size={16} className="m-3 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

export function PostCard({ post, viewer, defaultOpenComments }: { post: PostView; viewer: { id: string; displayName: string; avatarUrl: string | null } | null; defaultOpenComments?: boolean }) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(!!defaultOpenComments);
  const [repostOpen, setRepostOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [coauthorsOpen, setCoauthorsOpen] = useState(false);
  const [, start] = useTransition();
  const safety = useSafetyMenu({ targetType: "POST", targetId: post.id, authorId: post.author.id, authorName: post.author.displayName });
  if (gone) return null;

  const own: MenuItem[] = [
    { label: "Bearbeiten", icon: <Pencil size={15} />, onSelect: () => router.push(`/studio/inhalte/beitrag/${post.id}`) },
    ...(post.repostOf || post.community ? [] : [{ label: "Koautor:innen", icon: <Users size={15} />, onSelect: () => setCoauthorsOpen(true) }]),
    {
      label: "Löschen",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: async () =>
        (await confirmDialog("Beitrag endgültig löschen?")) &&
        start(async () => {
          const r = await callAction(() => deletePostAction(post.id));
          if (r.ok) {
            setGone(true);
            toast("Beitrag gelöscht.");
          }
        }),
    },
  ];
  const coauthorItems: MenuItem[] = post.viewer.isCoauthor ? [{ label: "Als Koautor:in austreten", icon: <LogOut size={15} />, onSelect: () => void leaveCoauthor(post.id, () => router.refresh()) }] : [];
  const kind = KIND_LABEL[post.kind];
  const co = post.coauthors;
  const cat = categoryBySlug(post.category);

  return (
    <article className="border-b border-line py-6 first:pt-2" aria-labelledby={`post-${post.id}-author`}>
      <header className="flex items-start gap-3">
        <span className="relative shrink-0">
          <Link aria-label={`Profil von ${post.author.displayName}`} href={`/u/${post.author.handle}`} className="block">
            <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={42} />
          </Link>
          {co.length > 0 && (
            <span className="absolute -bottom-1.5 -right-1.5 flex -space-x-2">
              {co.slice(0, 2).map((c) => (
                <Link key={c.id} href={`/u/${c.handle}`} aria-label={`Profil von ${c.displayName}`} className="rounded-full ring-2 ring-paper">
                  <Avatar src={c.avatarUrl} name={c.displayName} size={22} />
                </Link>
              ))}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span id={`post-${post.id}-author`} className="min-w-0">
              <Link href={`/u/${post.author.handle}`} className="font-semibold hover:underline">
                {post.author.displayName}
              </Link>
              {co.map((c, i) => (
                <span key={c.id}>
                  <span className="text-muted">{i === 0 ? " mit " : i === co.length - 1 ? " und " : ", "}</span>
                  <Link href={`/u/${c.handle}`} className="font-semibold hover:underline">
                    {c.displayName}
                  </Link>
                </span>
              ))}
            </span>
            {co.length === 0 && <span className="truncate text-sm text-muted">@{post.author.handle}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <Link href={`/beitrag/${post.id}`} className="hover:underline">
              <RelativeTime date={post.publishedAt} />
            </Link>
            {post.editedAt && <span>· bearbeitet</span>}
            {cat && (
              <>
                <span>·</span>
                <Link href={`/entdecken?kategorie=${cat.slug}`} className="hover:text-ink">{cat.short}</Link>
              </>
            )}
            {post.community && (
              <>
                <span>·</span>
                <Link href={`/c/${post.community.slug}`} className="hover:text-ink">in {post.community.name}</Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {post.isCommercial ? <Badge tone="clay">Verkauf</Badge> : kind && <Badge>{kind}</Badge>}
          {viewer && <MoreMenu items={post.viewer.isAuthor ? own : [...coauthorItems, ...safety.items]} />}
        </div>
      </header>

      <div className={cn("mt-3", (post.project || post.tutorial || post.product || post.article) && "border-l border-rule pl-3")}>
        {post.body && <RichText text={post.body} className="text-[15.5px] leading-relaxed text-ink-2" />}
        {post.poll && <PollBlock postId={post.id} poll={post.poll} signedIn={!!viewer} />}

        {post.repostOf && (
          <Link href={`/beitrag/${post.repostOf.id}`} className="mt-3 block border border-line p-3.5 hover:border-rule-strong rounded-2xl">
            <p className="text-sm font-semibold">{post.repostOf.author?.displayName} <span className="font-normal text-muted">@{post.repostOf.author?.handle}</span></p>
            <p className="mt-1 line-clamp-3 text-sm text-ink-2">{post.repostOf.body}</p>
          </Link>
        )}

        {post.media.length > 0 && (
          <div className="mt-3">
            <Gallery media={post.media} postId={post.id} />
          </div>
        )}

        {post.project && <ProjectLink p={post.project} />}

        {post.tutorial && (
          <Link href={`/anleitungen/${post.tutorial.slug}`} className="mt-3 flex items-center justify-between border border-line bg-card px-4 py-3 hover:border-rule-strong rounded-2xl">
            <span>
              <span className="spec">Neue Anleitung</span>
              <span className="block font-semibold">{post.tutorial.title}</span>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        )}
        {post.article && (
          <Link href={`/u/${post.article.authorHandle}/blog/${post.article.slug}`} className="mt-3 block border border-line bg-card px-4 py-3 hover:border-rule-strong rounded-2xl">
            <span className="spec">Artikel · {post.article.readingMinutes} Min. Lesezeit</span>
            <span className="headline mt-1 block text-xl">{post.article.title}</span>
            {post.article.dek && <span className="mt-1 block text-sm text-muted line-clamp-2">{post.article.dek}</span>}
          </Link>
        )}
        {post.product && (
          <Link href={`/markt/${post.product.shop.slug}/${post.product.slug}`} className="mt-3 flex items-center justify-between border border-clay/40 bg-clay-soft px-4 py-3 hover:border-clay rounded-2xl">
            <span>
              <span className="spec text-clay-ink">Im Shop von {post.product.shop.name}</span>
              <span className="block font-semibold">{post.product.title}</span>
            </span>
            <span className="font-mono text-sm font-semibold">{formatMoney(post.product.priceMinor, post.product.currency as Currency)}</span>
          </Link>
        )}
      </div>

      <footer className="mt-4 flex items-center gap-6">
        <LikeButton type="POST" id={post.id} liked={post.viewer.liked} count={post.counts.likes} />
        <button type="button" onClick={() => setShowComments((s) => !s)} aria-expanded={showComments} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <MessageCircle size={18} strokeWidth={1.7} />
          <span className="num font-medium">{post.counts.comments > 0 ? compactNumber(post.counts.comments) : ""}</span>
          <span className="sr-only">Kommentare</span>
        </button>
        {post.visibility === "PUBLIC" && !post.repostOf && !post.community && (
          <button type="button" onClick={() => (viewer ? setRepostOpen(true) : router.push("/anmelden"))} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-moss" aria-label="Mit eigener Einordnung teilen">
            <Repeat2 size={18} strokeWidth={1.7} />
            <span className="num font-medium">{post.counts.reposts > 0 ? compactNumber(post.counts.reposts) : ""}</span>
          </button>
        )}
        <span className="ml-auto flex items-center gap-5">
          <SaveButton type="POST" id={post.id} saved={post.viewer.saved} />
          <ShareButton url={`/beitrag/${post.id}`} title={`Beitrag von ${post.author.displayName}`} />
        </span>
      </footer>

      {showComments && (
        <div className="mt-5 border-t border-line pt-5 animate-fade">
          <Comments targetType="POST" targetId={post.id} viewer={viewer} canModerate={post.viewer.isAuthor} />
        </div>
      )}

      {safety.dialog}
      {post.viewer.isAuthor && <CoauthorDialog postId={post.id} open={coauthorsOpen} onClose={() => setCoauthorsOpen(false)} />}
      <RepostDialog open={repostOpen} onClose={() => setRepostOpen(false)} post={post} />
      {post.viewer.isAuthor && <EditDialog open={editOpen} onClose={() => setEditOpen(false)} post={post} />}
    </article>
  );
}

function RepostDialog({ open, onClose, post }: { open: boolean; onClose: () => void; post: PostView }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onClose={onClose} title="Mit Einordnung teilen" description="Erzähl, warum dich das inspiriert.">
      <Textarea aria-label="Deine Gedanken zum geteilten Beitrag" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Deine Gedanken (optional)" maxLength={5000} />
      <div className="mt-3 border border-line p-3 text-sm text-muted line-clamp-3 rounded-2xl">
        <strong className="text-ink">{post.author.displayName}:</strong> {post.body || "Medienbeitrag"}
      </div>
      <Button
        className="mt-4 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await callAction(() => repostAction(post.id, body));
            if (r.ok) {
              toast("Geteilt.");
              onClose();
              router.refresh();
            } else toast(r.error, "error");
          })
        }
      >
        Teilen
      </Button>
    </Dialog>
  );
}

function EditDialog({ open, onClose, post }: { open: boolean; onClose: () => void; post: PostView }) {
  const [body, setBody] = useState(post.body);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onClose={onClose} title="Beitrag bearbeiten">
      <Textarea aria-label="Text des Beitrags" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} />
      <Button
        className="mt-4 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await callAction(() => updatePostAction(post.id, { body, category: post.category ?? undefined, visibility: post.visibility }));
            if (r.ok) {
              toast("Gespeichert.");
              onClose();
              router.refresh();
            } else toast(r.error, "error");
          })
        }
      >
        Speichern
      </Button>
    </Dialog>
  );
}
