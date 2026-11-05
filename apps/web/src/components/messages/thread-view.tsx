"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, Ban, Flag, ShieldAlert } from "lucide-react";
import type { MessageView, ThreadData } from "@/server/messaging/service";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { MoreMenu, ReportDialog, type MenuItem } from "@/components/social/actions";
import { RichText } from "@/components/social/post-card";
import { blockAction } from "@/app/(app)/social-actions";
import { archiveConversationAction, loadOlderMessagesAction, markReadAction, respondToRequestAction, sendMessageAction } from "@/app/(app)/nachrichten/actions";
import { cn, formatDate } from "@/lib/utils";
import { MessageComposer, type ComposerHandle } from "./composer";
import { ContextCard } from "./context-card";

const POLL_MS = 6000;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86400_000);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Heute";
  if (dayKey(iso) === dayKey(y.toISOString())) return "Gestern";
  return formatDate(d, { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });

function merge(prev: MessageView[], next: MessageView[]) {
  if (!next.length) return prev;
  const ids = new Set(prev.map((m) => m.id));
  const add = next.filter((m) => !ids.has(m.id));
  return add.length ? [...prev, ...add].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : prev;
}

function Warning() {
  return (
    <div role="note" className="rounded-2xl mb-1.5 flex max-w-[34rem] gap-2.5 bg-warn-soft px-3 py-2 text-[13px] leading-snug text-ink-2">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <span>
        <strong className="font-semibold text-ink">Vorsicht:</strong> Diese Nachricht erwähnt eine Zahlung ausserhalb von WERKRAUM (z.B. TWINT, IBAN, PayPal-Link oder Kurzlink). Bezahle nur über den Checkout – nur dann bist du geschützt. Teile keine Zugangsdaten.
      </span>
    </div>
  );
}

function Bubble({ m, otherName, onReport, showTime }: { m: MessageView; otherName: string; onReport: () => void; showTime: boolean }) {
  const flagged = !m.mine && m.flags.includes("SUSPICIOUS_PAYMENT_LINK");
  return (
    <div className={cn("group flex flex-col", m.mine ? "items-end" : "items-start")}>
      {flagged && <Warning />}
      <div className={cn("flex max-w-[85%] items-end gap-2 sm:max-w-[70%]", m.mine && "flex-row-reverse")}>
        <div className={cn("min-w-0 px-3.5 py-2", m.removed ? "border border-dashed border-line-strong text-muted rounded-2xl" : m.mine ? "bg-moss text-paper" : "border border-line bg-card text-ink rounded-2xl", flagged && "border-warn")}>
          <p className="sr-only">{m.mine ? "Du" : otherName}, {time(m.createdAt)}:</p>
          {m.removed ? (
            <p className="text-sm italic">Diese Nachricht wurde entfernt.</p>
          ) : (
            <>
              {m.media.length > 0 && (
                <ul className={cn("mb-1.5 grid gap-1", m.media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {m.media.map((img) => (
                    <li key={img.id}>
                      <a href={img.url} target="_blank" rel="noopener" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumb || img.url} alt={img.alt || "Bild"} loading="lazy" className="max-h-64 w-full object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {m.body &&
                (flagged ? (
                  <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{m.body}</p>
                ) : (
                  <RichText text={m.body} className={cn("break-words text-[15px] leading-relaxed", m.mine && "[&_a]:text-paper [&_a]:underline")} />
                ))}
            </>
          )}
        </div>
        {!m.mine && !m.removed && (
          <button type="button" onClick={onReport} className="mb-1 shrink-0 p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100" aria-label="Nachricht melden">
            <Flag size={13} />
          </button>
        )}
      </div>
      {showTime && <time dateTime={m.createdAt} className="mt-1 font-mono text-[10px] text-muted num">{time(m.createdAt)}</time>}
    </div>
  );
}

export function ThreadView({ thread, box }: { thread: ThreadData; box: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState(thread.messages);
  const [hasMore, setHasMore] = useState(thread.hasMore);
  const [otherRead, setOtherRead] = useState(thread.other?.lastReadAt ?? null);
  const [otherPending, setOtherPending] = useState(!!thread.other?.pendingRequest);
  const [isRequest, setIsRequest] = useState(thread.me.isRequest);
  const [archived, setArchived] = useState(thread.me.archived);
  const [announce, setAnnounce] = useState("");
  const [newBelow, setNewBelow] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportUser, setReportUser] = useState(false);
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const lastAt = useRef(thread.messages.at(-1)?.createdAt ?? null);
  const nearBottom = useRef(true);
  const otherName = thread.other?.displayName ?? "Unbekannt";
  const backHref = box === "inbox" ? "/nachrichten" : `/nachrichten?ordner=${box === "requests" ? "anfragen" : "archiv"}`;

  // Server-Refresh: gleiche Unterhaltung → zusammenführen (ältere geladene Nachrichten bleiben), neue → ersetzen
  const shownId = useRef(thread.id);
  useEffect(() => {
    if (shownId.current !== thread.id) {
      shownId.current = thread.id;
      setMessages(thread.messages);
      setHasMore(thread.hasMore);
      setIsRequest(thread.me.isRequest);
      setArchived(thread.me.archived);
    } else {
      setMessages((prev) => merge(prev, thread.messages));
    }
    const last = thread.messages.at(-1)?.createdAt ?? null;
    if (last && (!lastAt.current || last > lastAt.current)) lastAt.current = last;
  }, [thread.id, thread.messages, thread.hasMore, thread.me.isRequest, thread.me.archived]);

  const scrollToBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(false);
  };

  useLayoutEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Beim Öffnen als gelesen markieren
  useEffect(() => {
    void markReadAction(thread.id).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/v1/conversations/${thread.id}/messages${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = (await res.json()) as { data: { messages: MessageView[]; otherLastReadAt: string | null; otherPendingRequest: boolean } };
      setOtherRead(data.otherLastReadAt);
      setOtherPending(data.otherPendingRequest);
      if (data.messages.length) {
        lastAt.current = data.messages.at(-1)!.createdAt;
        setMessages((prev) => merge(prev, data.messages));
        const incoming = data.messages.filter((m) => !m.mine);
        if (incoming.length) {
          const last = incoming.at(-1)!;
          setAnnounce(`Neue Nachricht von ${otherName}: ${last.body ? last.body.slice(0, 120) : "Bild"}`);
          if (nearBottom.current) requestAnimationFrame(() => scrollToBottom(true));
          else setNewBelow(true);
          await markReadAction(thread.id);
          router.refresh();
        }
      }
    } catch {
      /* Netzwerk – nächster Versuch beim nächsten Intervall */
    }
  }, [thread.id, otherName, router]);

  useEffect(() => {
    const t = setInterval(poll, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  async function send(body: string, media: { id: string; alt: string }[]) {
    const r = await sendMessageAction(thread.id, { body, media });
    if (!r.ok) {
      toast(r.error, "error");
      return false;
    }
    lastAt.current = r.data.createdAt;
    setMessages((prev) => merge(prev, [r.data]));
    if (isRequest) setIsRequest(false);
    if (archived) setArchived(false);
    requestAnimationFrame(() => scrollToBottom(true));
    router.refresh();
    return true;
  }

  const loadOlder = () =>
    start(async () => {
      const first = messages[0];
      if (!first) return;
      const el = scroller.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const r = await loadOlderMessagesAction(thread.id, first.createdAt);
      if (!r.ok) return toast(r.error, "error");
      setMessages((prev) => [...r.data.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(r.data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    });

  const respond = (accept: boolean) =>
    start(async () => {
      const r = await respondToRequestAction(thread.id, accept);
      if (!r.ok) return toast(r.error, "error");
      toast(r.message ?? "");
      if (accept) {
        setIsRequest(false);
        composer.current?.focus();
        router.refresh();
      } else router.push("/nachrichten?ordner=anfragen");
    });

  const menu: MenuItem[] = [
    ...(!isRequest
      ? [
          {
            label: archived ? "Zurück in den Posteingang" : "Archivieren",
            icon: archived ? <ArchiveRestore size={15} /> : <Archive size={15} />,
            onSelect: () =>
              start(async () => {
                const r = await archiveConversationAction(thread.id, !archived);
                if (r.ok) {
                  setArchived(!archived);
                  toast(r.message ?? "");
                  router.refresh();
                } else toast(r.error, "error");
              }),
          },
        ]
      : []),
    ...(thread.other
      ? [
          { label: `${otherName} melden`, icon: <Flag size={15} />, onSelect: () => setReportUser(true) },
          {
            label: `${otherName} blockieren`,
            icon: <Ban size={15} />,
            danger: true,
            onSelect: () =>
              confirm(`${otherName} blockieren? Ihr könnt euch dann keine Nachrichten mehr schicken.`) &&
              start(async () => {
                const r = await blockAction(thread.other!.id, true);
                if (r.ok) {
                  toast("Profil blockiert.");
                  router.push("/nachrichten");
                } else toast(r.error, "error");
              }),
          },
        ]
      : []),
  ];

  const lastMine = [...messages].reverse().find((m) => m.mine && !m.removed);
  const lastMineRead = lastMine && otherRead && otherRead >= lastMine.createdAt;

  let prevDay = "";
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Unterhaltung mit ${otherName}`}>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
        <Link href={backHref} className="grid size-9 place-items-center text-muted hover:text-ink md:hidden" aria-label="Zurück zur Übersicht">
          <ArrowLeft size={18} />
        </Link>
        {thread.other ? (
          <Link href={`/u/${thread.other.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar src={thread.other.avatarUrl} name={otherName} size={36} />
            <span className="min-w-0">
              <span className="block truncate font-semibold hover:underline">{otherName}</span>
              <span className="block truncate text-xs text-muted">@{thread.other.handle}{thread.kind === "ORDER" ? " · Käufer↔Verkäufer" : ""}</span>
            </span>
          </Link>
        ) : (
          <span className="flex-1 font-semibold">Unterhaltung</span>
        )}
        {menu.length > 0 && <MoreMenu items={menu} label="Optionen der Unterhaltung" />}
      </header>

      {thread.context && (
        <div className="border-b border-line px-3 py-2.5 sm:px-5">
          <ContextCard ctx={thread.context} />
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (nearBottom.current) setNewBelow(false);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <button type="button" onClick={loadOlder} disabled={pending} className="border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-rule-strong hover:text-ink rounded-2xl">
              {pending ? "Lädt …" : "Ältere Nachrichten laden"}
            </button>
          </div>
        )}
        {messages.length === 0 && <p className="mt-10 text-center text-sm text-muted">Noch keine Nachrichten.</p>}
        <ol role="log" aria-live="off" aria-label="Nachrichtenverlauf" className="space-y-2">
          {messages.map((m, i) => {
            const d = dayKey(m.createdAt);
            const sep = d !== prevDay;
            prevDay = d;
            const next = messages[i + 1];
            const showTime = !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== d || new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000;
            return (
              <li key={m.id}>
                {sep && (
                  <p className="my-5 flex items-center gap-3 spec" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(m.createdAt)}
                    <span className="h-px flex-1 bg-line" />
                  </p>
                )}
                <Bubble m={m} otherName={otherName} onReport={() => setReportId(m.id)} showTime={showTime} />
                {lastMine?.id === m.id && (
                  <p className="mt-0.5 text-right text-[11px] text-muted" aria-live="polite">
                    {lastMineRead ? "Gelesen" : otherPending ? "Als Kontaktanfrage zugestellt" : "Zugestellt"}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {newBelow && (
          <button type="button" onClick={() => scrollToBottom(true)} className="sticky bottom-2 left-full ml-auto mt-2 flex items-center gap-1.5 bg-moss px-3 py-1.5 text-xs font-semibold text-paper rounded-2xl">
            <ArrowDown size={13} /> Neue Nachrichten
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite" role="status">{announce}</p>

      {isRequest && thread.other && (
        <div className="border-t border-line bg-sunken px-4 py-3">
          <p className="text-sm"><strong className="font-semibold">{otherName}</strong> möchte dir schreiben. {otherName} sieht nicht, ob du die Nachricht gelesen hast, bis du annimmst.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => respond(true)}>Annehmen</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}>Ablehnen</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReportUser(true)}><Flag size={13} /> Melden</Button>
          </div>
        </div>
      )}
      {!isRequest && otherPending && thread.requestQuotaLeft !== null && (
        <p className="border-t border-line bg-sunken px-4 py-2 text-xs text-muted" role="status">
          Deine Nachricht wurde als Kontaktanfrage zugestellt. Bis {otherName} annimmt, kannst du {thread.requestQuotaLeft > 0 ? `noch höchstens ${thread.requestQuotaLeft} Nachricht${thread.requestQuotaLeft === 1 ? "" : "en"}` : "keine weiteren Nachrichten"} senden.
        </p>
      )}

      <MessageComposer
        ref={composer}
        onSend={send}
        disabled={!thread.canSend}
        disabledReason={
          thread.messagingRestrictedUntil
            ? `Deine Nachrichtenfunktion ist bis ${formatDate(thread.messagingRestrictedUntil, { day: "numeric", month: "long" })} eingeschränkt.`
            : thread.other?.declined
              ? "Diese Unterhaltung ist geschlossen."
              : !thread.other?.active
                ? "Dieses Konto kann derzeit keine Nachrichten empfangen."
                : undefined
        }
        placeholder={isRequest ? "Antworten nimmt die Anfrage an …" : `Nachricht an ${otherName} …`}
      />

      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="MESSAGE" targetId={reportId} />}
      {thread.other && <ReportDialog open={reportUser} onClose={() => setReportUser(false)} targetType="USER" targetId={thread.other.id} />}
    </section>
  );
}
