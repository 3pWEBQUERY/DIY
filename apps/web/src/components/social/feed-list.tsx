"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PostView, FeedKind } from "@/server/social/posts";
import { PostCard } from "./post-card";
import { loadFeedAction } from "@/app/(app)/social-actions";

/** Cursor-paginiertes Nachladen mit IntersectionObserver + Fallback-Button (§9.6). */
export function FeedList({ kind, initial, cursor: initialCursor, viewer }: { kind: FeedKind; initial: PostView[]; cursor: string | null; viewer: { id: string; displayName: string; avatarUrl: string | null } | null }) {
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
      const r = await loadFeedAction(kind, cursor);
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

  return (
    <div>
      {items.map((p) => (
        <PostCard key={p.id} post={p} viewer={viewer} />
      ))}
      <div ref={sentinel} />
      {cursor ? (
        <button onClick={more} disabled={pending} className="mt-6 w-full border border-line py-3 text-sm font-semibold text-muted hover:border-rule-strong hover:text-ink rounded-2xl">
          {pending ? "Lädt …" : "Mehr laden"}
        </button>
      ) : (
        items.length > 0 && (
          <p className="mt-10 flex items-center gap-4 spec">
            <span className="h-px flex-1 bg-line" />
            Du bist auf dem neuesten Stand
            <span className="h-px flex-1 bg-line" />
          </p>
        )
      )}
    </div>
  );
}
