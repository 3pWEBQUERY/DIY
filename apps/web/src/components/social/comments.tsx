"use client";

import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { TargetType } from "@/generated/prisma/enums";
import type { CommentView } from "@/server/social/interactions";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Linkified } from "@/components/ui/linkify";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/relative-time";
import { commentAction, commentMetaAction, deleteCommentAction, listCommentsAction, lockCommentsAction, pinCommentAction, unfilterCommentAction } from "@/app/(app)/social-actions";
import type { CommentMeta } from "@/server/pro/comment-tools";
import { EyeOff, Lock, Pin } from "lucide-react";
import { LikeButton, ReportDialog } from "./actions";
import { callAction, callData } from "@/lib/use-action";
import { useHashtagAssist } from "@/components/hashtags/hashtag-assist";

/** Kommentare & Fragen mit einer Antwortebene (§9.4). */
export function Comments({
  targetType,
  targetId,
  initial,
  initialCursor = null,
  viewer,
  placeholder = "Kommentieren …",
  questionsMode,
  canModerate,
  stepKey,
  onCount,
}: {
  targetType: TargetType;
  targetId: string;
  initial?: CommentView[];
  /** Cursor zu älteren Kommentaren, falls `initial` nur die neueste Seite ist */
  initialCursor?: string | null;
  viewer: { id: string; displayName: string; avatarUrl: string | null } | null;
  placeholder?: string;
  questionsMode?: boolean;
  /** Eigentümer:in des Inhalts darf Kommentare darunter entfernen */
  canModerate?: boolean;
  /** Nur Fragen zu diesem Anleitungsschritt zeigen und neue Fragen diesem Schritt zuordnen */
  stepKey?: string;
  /** Anzahl geladener Hauptbeiträge (z. B. für „Fragen (n)“ am Schritt) */
  onCount?: (n: number) => void;
}) {
  const [items, setItems] = useState<CommentView[] | null>(initial ?? null);
  const [cursor, setCursor] = useState<string | null>(initial ? initialCursor : null);
  // Anzahl geladener Seiten – nach Senden/Löschen werden genau so viele neu geladen
  const [pages, setPages] = useState(1);
  const [, start] = useTransition();
  const [loadingOlder, startOlder] = useTransition();
  const [failed, setFailed] = useState(false);
  const pathname = usePathname();
  // Geschlossen? Inhaber:in? Creator Pro? (Anheften, Wortfilter, Schliessen)
  const [meta, setMeta] = useState<CommentMeta | null>(null);
  const [locking, startLock] = useTransition();
  useEffect(() => {
    let alive = true;
    callData(() => commentMetaAction(targetType, targetId)).then((r) => alive && r.ok && setMeta(r.data));
    return () => {
      alive = false;
    };
  }, [targetType, targetId]);
  const owner = meta?.isOwner ? { pro: meta.ownerPro, name: meta.ownerName } : null;
  const mod = canModerate || !!meta?.isOwner;
  const toggleLock = () =>
    meta &&
    startLock(async () => {
      const r = await callAction(() => lockCommentsAction(targetType, targetId, !meta.locked));
      if (!r.ok) return void toast(r.error, "error");
      toast(r.message ?? "");
      setMeta({ ...meta, locked: !meta.locked });
    });

  const reload = () =>
    start(async () => {
      // Netz-/Serverfehler: bisherige Kommentare stehen lassen, nur melden
      let r = await callData(() => listCommentsAction(targetType, targetId, null, stepKey));
      if (!r.ok) {
        setFailed(true);
        return void toast(r.error, "error");
      }
      let all = r.data.items;
      let next = r.data.nextCursor;
      for (let i = 1; i < pages && next; i++) {
        const c: string = next;
        r = await callData(() => listCommentsAction(targetType, targetId, c, stepKey));
        if (!r.ok) {
          setFailed(true);
          return void toast(r.error, "error");
        }
        all = [...r.data.items, ...all];
        next = r.data.nextCursor;
      }
      setFailed(false);
      setItems(all);
      setCursor(next);
    });
  const loadOlder = () =>
    cursor &&
    startOlder(async () => {
      const r = await callData(() => listCommentsAction(targetType, targetId, cursor, stepKey));
      if (!r.ok) return void toast(r.error, "error");
      setItems((prev) => [...r.data.items, ...(prev ?? [])]);
      setCursor(r.data.nextCursor);
      setPages((n) => n + 1);
    });
  useEffect(() => {
    if (!initial) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, stepKey]);
  useEffect(() => {
    if (items && !cursor) onCount?.(items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cursor]);
  // Angehefteter Kommentar ganz oben, dann als Lösung markierte, danach chronologisch (ältere Seiten davor)
  const pinned = items?.filter((c) => c.pinned) ?? [];
  const answers = items?.filter((c) => c.isAnswer && !c.pinned) ?? [];
  const rest = items?.filter((c) => !c.isAnswer && !c.pinned) ?? [];
  const itemProps = { targetType, targetId, viewer, onChange: reload, canModerate: mod, hideStep: !!stepKey, owner, ownerName: meta?.ownerName ?? "" };

  return (
    <div>
      {meta?.isOwner && meta.lockable && !stepKey && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            {meta.locked ? <Lock size={13} aria-hidden /> : null}
            {meta.locked ? "Kommentare sind geschlossen – niemand kann mehr kommentieren." : "Du kannst Kommentare anheften und die Kommentare schliessen."}
          </span>
          {meta.locked || meta.ownerPro ? (
            <Button variant="ghost" size="sm" onClick={toggleLock} disabled={locking}>
              {meta.locked ? "Kommentare öffnen" : "Kommentare schliessen"}
            </Button>
          ) : (
            <Link href="/studio/pro" className="text-[12.5px] font-semibold text-ink-2 underline-offset-2 hover:underline">
              Mit Creator Pro
            </Link>
          )}
        </div>
      )}
      {meta?.locked ? (
        !meta.isOwner || stepKey ? (
          <p className="flex items-center gap-2 border border-line bg-sunken px-4 py-3 text-sm text-muted rounded-2xl">
            <Lock size={14} aria-hidden /> Die Kommentare sind geschlossen.
          </p>
        ) : null
      ) : viewer ? (
        <CommentForm targetType={targetType} targetId={targetId} viewer={viewer} placeholder={placeholder} onDone={reload} stepKey={stepKey} />
      ) : (
        <p className="border border-line bg-sunken px-4 py-3 text-sm text-muted rounded-2xl">
          <Link href={`/anmelden?weiter=${encodeURIComponent(pathname)}`} className="font-semibold text-ink underline underline-offset-2">Melde dich an</Link>, um {questionsMode ? "Fragen zu stellen" : "mitzudiskutieren"}.
        </p>
      )}
      <ul className="mt-5 space-y-5">
        {items === null &&
          (failed ? (
            <li className="flex items-center gap-3 text-sm text-muted">
              Kommentare konnten nicht geladen werden.
              <Button variant="ghost" size="sm" onClick={reload}>Erneut versuchen</Button>
            </li>
          ) : (
            <li className="spec">Lade Kommentare …</li>
          ))}
        {items?.length === 0 && <li className="text-sm text-muted">{stepKey ? "Noch keine Fragen zu diesem Schritt." : questionsMode ? "Noch keine Fragen. Was möchtest du wissen?" : "Noch keine Kommentare. Sag als Erste:r etwas Nettes."}</li>}
        {pinned.map((c) => (
          <CommentItem key={c.id} c={c} {...itemProps} />
        ))}
        {answers.map((c) => (
          <CommentItem key={c.id} c={c} {...itemProps} />
        ))}
        {cursor && (
          <li>
            <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? "Lade …" : questionsMode ? "Ältere Fragen laden" : "Ältere Kommentare laden"}
            </Button>
          </li>
        )}
        {rest.map((c) => (
          <CommentItem key={c.id} c={c} {...itemProps} />
        ))}
      </ul>
    </div>
  );
}

function CommentForm({ targetType, targetId, parentId, viewer, placeholder, onDone, autoFocus, initialBody = "", stepKey }: { targetType: TargetType; targetId: string; parentId?: string; viewer: { displayName: string; avatarUrl: string | null }; placeholder: string; onDone: () => void; autoFocus?: boolean; initialBody?: string; stepKey?: string }) {
  const [body, setBody] = useState(initialBody);
  const tags = useHashtagAssist(body, setBody);
  const field = useRef<HTMLTextAreaElement>(null);
  // Bei vorausgefüllter @Erwähnung den Cursor ans Ende setzen
  useEffect(() => {
    if (!autoFocus || !field.current) return;
    const el = field.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  const [pending, start] = useTransition();
  // Sofort gesetzt (pending aktualisiert sich erst mit dem nächsten Render) – verhindert doppelte Kommentare
  const sending = useRef(false);
  return (
    <form
      className="flex items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || sending.current) return;
        if (!body.trim() || body.trim() === initialBody.trim()) return;
        sending.current = true;
        start(async () => {
          try {
            const r = await callAction(() => commentAction(targetType, targetId, { body, parentId, ...(stepKey && !parentId ? { stepKey } : {}) }));
            if (r.ok) {
              setBody("");
              onDone();
            } else toast(r.error, "error");
          } finally {
            sending.current = false;
          }
        });
      }}
    >
      <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={32} />
      <div className="relative flex-1">
        <textarea
          ref={(el) => {
            field.current = el;
            tags.ref(el);
          }}
          value={body}
          onChange={tags.onChange}
          onSelect={tags.onSelect}
          {...tags.aria}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          autoFocus={autoFocus}
          maxLength={2000}
          onKeyDown={(e) => {
            if (tags.onKeyDown(e)) return;
            // Enter sendet (wie im Chat), Umschalt+Enter für eine neue Zeile
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!pending && !sending.current) e.currentTarget.form?.requestSubmit();
            }
          }}
          className="block min-h-10 w-full resize-none border-b border-line-strong bg-transparent py-2 text-[15px] outline-none field-sizing-content focus:border-moss"
        />
        {tags.popup}
        {body.trim() && body.trim() !== initialBody.trim() && (
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>Senden</Button>
          </div>
        )}
      </div>
    </form>
  );
}

function CommentItem({ c, targetType, targetId, viewer, onChange, isReply, canModerate, hideStep, owner, ownerName = "" }: { c: CommentView | CommentView["replies"][number]; targetType: TargetType; targetId: string; viewer: { id: string; displayName: string; avatarUrl: string | null } | null; onChange: () => void; isReply?: boolean; canModerate?: boolean; hideStep?: boolean; owner?: { pro: boolean; name: string } | null; ownerName?: string }) {
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [, start] = useTransition();
  const replies = "replies" in c ? c.replies : [];
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast(r.error ?? "Das hat nicht geklappt.", "error");
      if (r.message) toast(r.message);
      onChange();
    });
  return (
    <li className={cn("flex gap-3", isReply && "mt-4", c.filtered && "opacity-70")}>
      <Link aria-label={`Profil von ${c.author.displayName}`} href={`/u/${c.author.handle}`} className="shrink-0">
        <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={isReply ? 26 : 32} />
      </Link>
      <div className="min-w-0 flex-1">
        {c.pinned && !isReply && (
          <p className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-moss-ink">
            <Pin size={12} aria-hidden /> Angeheftet{ownerName ? ` von ${ownerName}` : ""}
          </p>
        )}
        {c.filtered && (
          <p className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
            <EyeOff size={12} aria-hidden /> Ausgeblendet durch deinen Wortfilter – nur du und die Person sehen ihn
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/u/${c.author.handle}`} className="text-sm font-semibold hover:underline">{c.author.displayName}</Link>
          <RelativeTime date={c.createdAt} className="text-xs text-muted" />
          {c.isQuestion && <span className="spec text-clay">Frage</span>}
          {c.isAnswer && <span className="spec text-moss">Lösung</span>}
          {!hideStep && !isReply && c.step && (
            <a href={`#schritt-${c.step.n}`} className="spec rounded-full border border-line-strong px-2 py-0.5 text-ink-2 hover:border-rule-strong hover:text-ink" title={c.step.title}>
              Schritt {c.step.n}
            </a>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-2"><Linkified text={c.body} links={false} /></p>
        <div className="mt-1.5 flex items-center gap-4">
          <LikeButton type="COMMENT" id={c.id} liked={c.liked} count={c.likeCount} size="sm" />
          {viewer && (
            <button type="button" onClick={() => setReplying((r) => !r)} aria-expanded={replying} className={cn("text-xs font-semibold hover:text-ink", replying ? "text-moss" : "text-muted")}>
              Antworten
            </button>
          )}
          {viewer && viewer.id !== c.author.id && (
            <button type="button" onClick={() => setReporting(true)} className="text-xs text-muted hover:text-ink">Melden</button>
          )}
          {owner && c.filtered && (
            <button type="button" onClick={() => run(() => callAction(() => unfilterCommentAction(c.id)))} className="text-xs font-semibold text-moss-ink hover:underline">
              Einblenden
            </button>
          )}
          {owner && !isReply && !c.filtered && (targetType === "POST" || targetType === "PROJECT" || targetType === "TUTORIAL" || targetType === "ARTICLE") &&
            (c.pinned || owner.pro ? (
              <button type="button" onClick={() => run(() => callAction(() => pinCommentAction(c.id, !c.pinned)))} className="text-xs text-muted hover:text-ink">
                {c.pinned ? "Lösen" : "Anheften"}
              </button>
            ) : (
              <Link href="/studio/pro" className="text-xs text-muted hover:text-ink" title="Kommentare anheften gehört zu Creator Pro">
                Anheften · Pro
              </Link>
            ))}
          {viewer && (viewer.id === c.author.id || canModerate) && (
            <button
              type="button"
              onClick={async () => (await confirmDialog(viewer.id === c.author.id ? "Kommentar löschen?" : "Diesen Kommentar unter deinem Inhalt entfernen?")) && start(async () => {
                  const r = await callAction(() => deleteCommentAction(c.id));
                  if (r.ok) onChange();
                  else toast(r.error, "error");
                })}
              className="text-xs text-muted hover:text-danger"
            >
              Löschen
            </button>
          )}
        </div>
        {replying && viewer && (
          <div className="mt-3">
            <CommentForm
              targetType={targetType}
              targetId={targetId}
              parentId={c.id}
              viewer={viewer}
              placeholder={`Antwort an ${c.author.displayName} …`}
              // Antwort auf eine Antwort: landet im selben Faden, mit @Erwähnung der Person
              initialBody={isReply && viewer.id !== c.author.id ? `@${c.author.handle} ` : ""}
              autoFocus
              onDone={() => { setReplying(false); onChange(); }}
            />
          </div>
        )}
        {replies.length > 0 && (
          <ul className="border-l border-line pl-4">
            {replies.map((r) => (
              <CommentItem key={r.id} c={r} targetType={targetType} targetId={targetId} viewer={viewer} onChange={onChange} isReply canModerate={canModerate} owner={owner} ownerName={ownerName} />
            ))}
          </ul>
        )}
        <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="COMMENT" targetId={c.id} />
      </div>
    </li>
  );
}

/** @Erwähnungen im Kommentartext als Profil-Links hervorheben. */
