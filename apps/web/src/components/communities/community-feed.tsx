"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Megaphone, Pin, PinOff, RotateCcw } from "lucide-react";
import type { PostView } from "@/server/social/posts";
import { PostCard } from "@/components/social/post-card";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Label, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  createCommunityPostAction,
  loadCommunityPostsAction,
  setPostAnnouncementAction,
  setPostHiddenAction,
  setPostPinnedAction,
} from "@/app/(app)/communities/actions";

type Viewer = { id: string; displayName: string; avatarUrl: string | null } | null;

/** Composer für Community-Beiträge (nur Mitglieder; Ankündigungen nur Moderation). */
export function CommunityComposer({ communityId, communityName, viewer, isMod }: { communityId: string; communityName: string; viewer: NonNullable<Viewer>; isMod: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [announce, setAnnounce] = useState(false);
  const [pending, start] = useTransition();
  const uploading = media.some((m) => m.state === "uploading");
  const ready = media.filter((m) => m.state === "ready");
  const canPost = (body.trim() || ready.length) && !uploading;
  const submit = () =>
    start(async () => {
      const r = await createCommunityPostAction(communityId, { body, media: ready.map((m) => ({ id: m.id, alt: m.alt })), isAnnouncement: announce });
      if (r.ok) {
        toast("Veröffentlicht.");
        setBody("");
        setMedia([]);
        setAnnounce(false);
        setOpen(false);
        router.refresh();
      } else toast(r.error, "error");
    });

  return (
    <section aria-label={`In ${communityName} schreiben`} className={cn("border bg-card rounded-2xl", open ? "border-ink" : "border-line")}>
      <div className="flex gap-3 p-4">
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={38} />
        <div className="min-w-0 flex-1">
          <label htmlFor="c-composer" className="sr-only">Beitrag in {communityName}</label>
          <textarea
            id="c-composer"
            value={body}
            onFocus={() => setOpen(true)}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canPost && !pending) submit();
            }}
            maxLength={5000}
            rows={open ? 3 : 1}
            placeholder={`Frage, Fortschritt oder Fundstück für ${communityName} …`}
            className="block w-full resize-none bg-transparent pt-2 text-[16px] leading-relaxed outline-none placeholder:text-muted field-sizing-content"
          />
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4 animate-fade">
          <MediaPicker value={media} onChange={setMedia} compact />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {isMod ? <Checkbox label={<span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> Als Ankündigung</span>} checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> : <span className="font-mono text-[11px] text-muted num">{body.length}/5000</span>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button disabled={!canPost || pending} onClick={submit}>
                {uploading ? "Lädt hoch …" : pending ? "Veröffentlicht …" : "Veröffentlichen"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ModBar({ communityId, post, isMod }: { communityId: string; post: PostView; isMod: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hideOpen, setHideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const run = (p: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await p();
      if (r.ok) {
        if (r.message) toast(r.message);
        router.refresh();
      } else toast(r.error ?? "Fehler", "error");
    });
  const flags = (post.isPinned || post.isAnnouncement) && (
    <span className="flex items-center gap-3">
      {post.isAnnouncement && <span className="spec inline-flex items-center gap-1 text-clay-ink"><Megaphone size={11} aria-hidden /> Ankündigung</span>}
      {post.isPinned && <span className="spec inline-flex items-center gap-1 text-ink"><Pin size={11} aria-hidden /> Angeheftet</span>}
    </span>
  );
  if (!isMod && !flags) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
      {flags || <span />}
      {isMod && (
        <span className="flex items-center gap-1" role="group" aria-label="Moderation">
          <button type="button" disabled={pending} onClick={() => run(() => setPostPinnedAction(communityId, post.id, !post.isPinned))} className="inline-flex h-7 items-center gap-1 px-2 text-xs text-muted hover:bg-sunken hover:text-ink rounded-xl">
            {post.isPinned ? <PinOff size={12} /> : <Pin size={12} />} {post.isPinned ? "Lösen" : "Anheften"}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => setPostAnnouncementAction(communityId, post.id, !post.isAnnouncement))} className="inline-flex h-7 items-center gap-1 px-2 text-xs text-muted hover:bg-sunken hover:text-ink rounded-xl">
            <Megaphone size={12} /> {post.isAnnouncement ? "Keine Ankündigung" : "Ankündigung"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setHideOpen(true)}
            className="inline-flex h-7 items-center gap-1 px-2 text-xs text-muted hover:bg-danger-soft hover:text-danger rounded-xl"
          >
            <EyeOff size={12} /> Ausblenden
          </button>
        </span>
      )}
      {isMod && (
        <Dialog open={hideOpen} onClose={() => setHideOpen(false)} title="Beitrag ausblenden" description="Der Beitrag verschwindet aus der Community. Du kannst ihn unter „Verwalten“ wiederherstellen.">
          <Label htmlFor={`hide-${post.id}`}>Grund (für das Moderationsprotokoll)</Label>
          <Textarea id={`hide-${post.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="z.B. Verstoss gegen Regel 2 – Werbung" />
          <Button
            variant="danger"
            className="mt-4 w-full"
            disabled={pending}
            onClick={() => {
              setHideOpen(false);
              run(() => setPostHiddenAction(communityId, post.id, true, reason));
            }}
          >
            Ausblenden
          </Button>
        </Dialog>
      )}
    </div>
  );
}

/** Beiträge einer Community: Angeheftete zuerst, dann chronologisch mit Nachladen. */
export function CommunityFeed({
  communityId,
  pinned,
  initial,
  cursor: initialCursor,
  viewer,
  isMod,
}: {
  communityId: string;
  pinned: PostView[];
  initial: PostView[];
  cursor: string | null;
  viewer: Viewer;
  isMod: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
  }, [initial, initialCursor]);

  const more = () => {
    if (!cursor || pending) return;
    start(async () => {
      const r = await loadCommunityPostsAction(communityId, cursor);
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((p) => !ids.has(p.id))];
      });
      setCursor(r.nextCursor);
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

  const renderPost = (p: PostView, highlight?: boolean) => (
    <div key={p.id} className={cn(highlight && "border-l-2 border-ink pl-4", p.isAnnouncement && "border-l-2 border-clay pl-4")}>
      <ModBar communityId={communityId} post={p} isMod={isMod} />
      <PostCard post={p} viewer={viewer} />
    </div>
  );

  return (
    <div>
      {pinned.length > 0 && <div className="mb-2 border-b border-ink">{pinned.map((p) => renderPost(p, true))}</div>}
      {items.map((p) => renderPost(p))}
      <div ref={sentinel} />
      {cursor ? (
        <button type="button" onClick={more} disabled={pending} className="mt-6 w-full border border-line py-3 text-sm font-semibold text-muted hover:border-ink hover:text-ink rounded-2xl">
          {pending ? "Lädt …" : "Ältere Beiträge laden"}
        </button>
      ) : (
        items.length + pinned.length > 0 && (
          <p className="mt-10 flex items-center gap-4 spec">
            <span className="h-px flex-1 bg-line" />
            Das war alles
            <span className="h-px flex-1 bg-line" />
          </p>
        )
      )}
    </div>
  );
}

/** Ausgeblendete Beiträge für die Moderation – mit Wiederherstellen. */
export function HiddenPosts({ communityId, posts, viewer }: { communityId: string; posts: PostView[]; viewer: Viewer }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id} className="border-b border-line">
          <div className="flex items-center justify-between pt-4">
            <span className="spec text-danger">Ausgeblendet</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setPostHiddenAction(communityId, p.id, false);
                  if (r.ok) {
                    toast("Beitrag wiederhergestellt.");
                    router.refresh();
                  } else toast(r.error, "error");
                })
              }
              className="inline-flex h-7 items-center gap-1 px-2 text-xs font-semibold hover:bg-sunken rounded-xl"
            >
              <RotateCcw size={12} /> Wiederherstellen
            </button>
          </div>
          <div className="opacity-70">
            <PostCard post={p} viewer={viewer} />
          </div>
        </li>
      ))}
    </ul>
  );
}
