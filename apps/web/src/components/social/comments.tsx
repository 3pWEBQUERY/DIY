"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { TargetType } from "@/generated/prisma/enums";
import type { CommentView } from "@/server/social/interactions";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { relativeTime, cn } from "@/lib/utils";
import { commentAction, deleteCommentAction, listCommentsAction } from "@/app/(app)/social-actions";
import { LikeButton, ReportDialog } from "./actions";

/** Kommentare & Fragen mit einer Antwortebene (§9.4). */
export function Comments({
  targetType,
  targetId,
  initial,
  viewer,
  placeholder = "Kommentieren …",
  questionsMode,
}: {
  targetType: TargetType;
  targetId: string;
  initial?: CommentView[];
  viewer: { id: string; displayName: string; avatarUrl: string | null } | null;
  placeholder?: string;
  questionsMode?: boolean;
}) {
  const [items, setItems] = useState<CommentView[] | null>(initial ?? null);
  const [, start] = useTransition();

  const reload = () => start(async () => setItems(await listCommentsAction(targetType, targetId)));
  useEffect(() => {
    if (!initial) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  return (
    <div>
      {viewer ? (
        <CommentForm targetType={targetType} targetId={targetId} viewer={viewer} placeholder={placeholder} onDone={reload} />
      ) : (
        <p className="border border-line bg-sunken px-4 py-3 text-sm text-muted rounded-2xl">
          <Link href="/anmelden" className="font-semibold text-ink underline underline-offset-2">Melde dich an</Link>, um {questionsMode ? "Fragen zu stellen" : "mitzudiskutieren"}.
        </p>
      )}
      <ul className="mt-5 space-y-5">
        {items === null && <li className="spec">Lade Kommentare …</li>}
        {items?.length === 0 && <li className="text-sm text-muted">{questionsMode ? "Noch keine Fragen. Was möchtest du wissen?" : "Noch keine Kommentare. Sag als Erste:r etwas Nettes."}</li>}
        {items?.map((c) => (
          <CommentItem key={c.id} c={c} targetType={targetType} targetId={targetId} viewer={viewer} onChange={reload} />
        ))}
      </ul>
    </div>
  );
}

function CommentForm({ targetType, targetId, parentId, viewer, placeholder, onDone, autoFocus }: { targetType: TargetType; targetId: string; parentId?: string; viewer: { displayName: string; avatarUrl: string | null }; placeholder: string; onDone: () => void; autoFocus?: boolean }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        start(async () => {
          const r = await commentAction(targetType, targetId, { body, parentId });
          if (r.ok) {
            setBody("");
            onDone();
          } else toast(r.error, "error");
        });
      }}
    >
      <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={32} />
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          autoFocus={autoFocus}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          className="block min-h-10 w-full resize-none border-b border-line-strong bg-transparent py-2 text-[15px] outline-none field-sizing-content focus:border-moss"
        />
        {body.trim() && (
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>Senden</Button>
          </div>
        )}
      </div>
    </form>
  );
}

function CommentItem({ c, targetType, targetId, viewer, onChange, isReply }: { c: CommentView | CommentView["replies"][number]; targetType: TargetType; targetId: string; viewer: { id: string; displayName: string; avatarUrl: string | null } | null; onChange: () => void; isReply?: boolean }) {
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [, start] = useTransition();
  const replies = "replies" in c ? c.replies : [];
  return (
    <li className={cn("flex gap-3", isReply && "mt-4")}>
      <Link href={`/u/${c.author.handle}`} className="shrink-0">
        <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={isReply ? 26 : 32} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/u/${c.author.handle}`} className="text-sm font-semibold hover:underline">{c.author.displayName}</Link>
          <span className="text-xs text-muted">{relativeTime(c.createdAt)}</span>
          {c.isQuestion && <span className="spec text-clay">Frage</span>}
          {c.isAnswer && <span className="spec text-moss">Lösung</span>}
        </div>
        <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{c.body}</p>
        <div className="mt-1.5 flex items-center gap-4">
          <LikeButton type="COMMENT" id={c.id} liked={c.liked} count={c.likeCount} size="sm" />
          {viewer && !isReply && (
            <button type="button" onClick={() => setReplying((r) => !r)} className="text-xs font-semibold text-muted hover:text-ink">Antworten</button>
          )}
          {viewer && viewer.id !== c.author.id && (
            <button type="button" onClick={() => setReporting(true)} className="text-xs text-muted hover:text-ink">Melden</button>
          )}
          {viewer && viewer.id === c.author.id && (
            <button
              type="button"
              onClick={() => confirm("Kommentar löschen?") && start(async () => { const r = await deleteCommentAction(c.id); if (r.ok) onChange(); })}
              className="text-xs text-muted hover:text-danger"
            >
              Löschen
            </button>
          )}
        </div>
        {replying && viewer && (
          <div className="mt-3">
            <CommentForm targetType={targetType} targetId={targetId} parentId={c.id} viewer={viewer} placeholder={`Antwort an ${c.author.displayName} …`} autoFocus onDone={() => { setReplying(false); onChange(); }} />
          </div>
        )}
        {replies.length > 0 && (
          <ul className="border-l border-line pl-4">
            {replies.map((r) => (
              <CommentItem key={r.id} c={r} targetType={targetType} targetId={targetId} viewer={viewer} onChange={onChange} isReply />
            ))}
          </ul>
        )}
        <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="COMMENT" targetId={c.id} />
      </div>
    </li>
  );
}
