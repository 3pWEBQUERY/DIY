"use client";

import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, Ban, Flag, Info, LogOut, ShieldAlert } from "lucide-react";
import { messageStatus, type MessageStatus, type Receipt } from "@/lib/message-status";
import { ReceiptTicks } from "./receipt-ticks";
import { presenceLabel, type Presence } from "@/lib/presence";
import { OnlineDot } from "@/components/ui/online-dot";
import type { MessageView, ThreadData } from "@/server/messaging/service";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { MoreMenu, ReportDialog, type MenuItem } from "@/components/social/actions";
import { RichText } from "@/components/social/post-card";
import { blockAction } from "@/app/(app)/social-actions";
import { archiveConversationAction, loadOlderMessagesAction, markReadAction, respondToRequestAction, sendMessageAction } from "@/app/(app)/nachrichten/actions";
import { cn, formatDate, smoothScroll } from "@/lib/utils";
import { TZ, zurichDayKey } from "@/lib/tz";
import { MessageComposer, type ComposerHandle } from "./composer";
import { ContextCard } from "./context-card";
import { GroupInfo } from "./group-info";
import { GroupAvatar } from "./inbox";
import { leaveGroupAction } from "@/app/(app)/nachrichten/actions";
import { LIVE_EVENT, refreshCounts, type LiveDetail } from "@/components/shell/live-counts";
import { callAction } from "@/lib/use-action";
import { BRAND } from "@/config/brand";

const POLL_MS = 5000; // Rückfall, falls der Live-Kanal (SSE) nicht verfügbar ist

// Kalendertage und Uhrzeiten immer in Zürcher Zeit: Der Server rendert in UTC, der Browser in seiner
// lokalen Zone – mit lokalen Gettern stimmten Uhrzeit und „Heute/Gestern“ nach der Hydration nicht.
const dayKey = (iso: string) => zurichDayKey(new Date(iso));
function dayLabel(iso: string) {
  const key = dayKey(iso);
  const now = new Date();
  // Kalendertag minus eins (UTC-Mitternacht, unabhängig von der Sommerzeit)
  const yesterday = new Date(Date.parse(`${zurichDayKey(now)}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  if (key === zurichDayKey(now)) return "Heute";
  if (key === yesterday) return "Gestern";
  return formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: key.slice(0, 4) === zurichDayKey(now).slice(0, 4) ? undefined : "numeric" });
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

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
        <strong className="font-semibold text-ink">Vorsicht:</strong> Diese Nachricht erwähnt eine Zahlung ausserhalb von {BRAND.name} (z. B. TWINT, IBAN, PayPal-Link oder Kurzlink). Bezahle nur über den Checkout – nur dann bist du geschützt. Teile keine Zugangsdaten.
      </span>
    </div>
  );
}

type Sender = { displayName: string; avatarUrl: string | null; handle: string };

function Bubble({ m, otherName, onReport, showTime, sender, status }: { m: MessageView; otherName: string; onReport: () => void; showTime: boolean; sender?: Sender | null; status?: MessageStatus | null }) {
  const flagged = !m.mine && m.flags.includes("SUSPICIOUS_PAYMENT_LINK");
  if (m.system) {
    return (
      <p className="mx-auto my-2 w-fit max-w-[90%] rounded-full bg-sunken px-3.5 py-1 text-center text-[12.5px] text-ink-2" role="note">
        {m.body}
      </p>
    );
  }
  return (
    <div className={cn("group flex flex-col", m.mine ? "items-end" : "items-start")}>
      {/* Gruppen: Name über der ersten Nachricht einer Folge */}
      {sender && (
        <Link href={`/u/${sender.handle}`} className="mb-1 ml-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2 hover:underline">
          <Avatar src={sender.avatarUrl} name={sender.displayName} size={18} />
          {sender.displayName}
        </Link>
      )}
      {flagged && <Warning />}
      <div className={cn("flex max-w-[85%] items-end gap-2 sm:max-w-[70%]", m.mine && "flex-row-reverse")}>
        <div className={cn("min-w-0 px-3.5 py-2", m.removed ? "rounded-[20px] border border-dashed border-line-strong text-muted" : m.mine ? "rounded-[20px] rounded-br-md bg-moss text-paper" : "rounded-[20px] rounded-bl-md border border-line bg-card text-ink", flagged && "border-warn")}>
          <p className="sr-only">{m.mine ? "Du" : sender?.displayName ?? otherName}, {time(m.createdAt)}:</p>
          {m.removed ? (
            <p className="text-sm">Diese Nachricht wurde entfernt.</p>
          ) : (
            <>
              {m.media.length > 0 && (
                <ul className={cn("mb-1.5 grid gap-1", m.media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {m.media.map((img) => (
                    <li key={img.id}>
                      <a href={img.url} target="_blank" rel="noopener" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumb || img.url} alt={img.alt || "Bild"} loading="lazy" className="max-h-64 w-full rounded-xl object-cover" />
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
              {status && (
                <span className="-mb-0.5 -mr-1 mt-0.5 flex justify-end">
                  <ReceiptTicks status={status} onBubble />
                </span>
              )}
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
  const [receipts, setReceipts] = useState<Receipt[]>(thread.receipts);
  const [presence, setPresence] = useState<Presence | null>(thread.other?.presence ?? null);
  const [otherPending, setOtherPending] = useState(!!thread.other?.pendingRequest);
  const [isRequest, setIsRequest] = useState(thread.me.isRequest);
  const [archived, setArchived] = useState(thread.me.archived);
  const [announce, setAnnounce] = useState("");
  const [newBelow, setNewBelow] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportUser, setReportUser] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const group = thread.group;
  const people = new Map((group?.members ?? []).map((p) => [p.id, p]));
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const lastAt = useRef(thread.messages.at(-1)?.createdAt ?? null);
  const nearBottom = useRef(true);
  const otherName = group ? group.title : thread.other?.displayName ?? "Unbekannt";
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
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? smoothScroll() : "auto" });
    setNewBelow(false);
  };

  useLayoutEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Beim Öffnen als gelesen markieren
  useEffect(() => {
    void markReadAction(thread.id).then(() => {
      refreshCounts();
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/v1/conversations/${thread.id}/messages${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = (await res.json()) as { data: { messages: MessageView[]; otherPendingRequest: boolean; receipts: Receipt[]; otherPresence?: Presence | null } };
      setReceipts(data.receipts);
      setPresence(data.otherPresence ?? null);
      setOtherPending(data.otherPendingRequest);
      if (data.messages.length) {
        lastAt.current = data.messages.at(-1)!.createdAt;
        setMessages((prev) => merge(prev, data.messages));
        if (group && data.messages.some((m) => m.system)) router.refresh();
        const incoming = data.messages.filter((m) => !m.mine && !m.system);
        if (incoming.length) {
          const last = incoming.at(-1)!;
          setAnnounce(`Neue Nachricht von ${people.get(last.senderId)?.displayName ?? otherName}: ${last.body ? last.body.slice(0, 120) : "Bild"}`);
          if (nearBottom.current) requestAnimationFrame(() => scrollToBottom(true));
          else setNewBelow(true);
          await callAction(() => markReadAction(thread.id));
          refreshCounts();
          router.refresh();
        }
      }
    } catch {
      /* Netzwerk – nächster Versuch beim nächsten Intervall */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, otherName, router]);

  // Echtzeit: neue Nachricht oder Lesebestätigung in genau dieser Unterhaltung → sofort abholen
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<LiveDetail>).detail;
      if (d?.c === thread.id && (d.type === "message" || d.type === "read")) void poll();
    };
    window.addEventListener(LIVE_EVENT, on);
    return () => window.removeEventListener(LIVE_EVENT, on);
  }, [poll, thread.id]);

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
    const r = await callAction(() => sendMessageAction(thread.id, { body, media }));
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
      const r = await callAction(() => loadOlderMessagesAction(thread.id, first.createdAt));
      if (!r.ok) return toast(r.error, "error");
      setMessages((prev) => [...r.data.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(r.data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    });

  const respond = (accept: boolean) =>
    start(async () => {
      const r = await callAction(() => respondToRequestAction(thread.id, accept));
      if (!r.ok) return toast(r.error, "error");
      refreshCounts();
      toast(r.message ?? "");
      if (accept) {
        setIsRequest(false);
        composer.current?.focus();
        router.refresh();
      } else router.push("/nachrichten?ordner=anfragen");
    });

  const menu: MenuItem[] = [
    ...(group
      ? [
          { label: "Gruppeninfo", icon: <Info size={15} />, onSelect: () => setInfoOpen(true) },
          {
            label: "Gruppe verlassen",
            icon: <LogOut size={15} />,
            danger: true,
            onSelect: async () =>
              (await confirmDialog("Gruppe verlassen? Du erhältst danach keine Nachrichten mehr aus dieser Gruppe.")) &&
              start(async () => {
                const r = await callAction(() => leaveGroupAction(thread.id));
                if (!r.ok) return toast(r.error, "error");
                toast(r.message ?? "");
                router.push("/nachrichten");
              }),
          },
        ]
      : []),
    ...(!isRequest
      ? [
          {
            label: archived ? "Zurück in den Posteingang" : "Archivieren",
            icon: archived ? <ArchiveRestore size={15} /> : <Archive size={15} />,
            onSelect: () =>
              start(async () => {
                const r = await callAction(() => archiveConversationAction(thread.id, !archived));
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
            onSelect: async () =>
              (await confirmDialog(`${otherName} blockieren? Ihr könnt euch dann keine Nachrichten mehr schicken.`)) &&
              start(async () => {
                const r = await callAction(() => blockAction(thread.other!.id, true));
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

  let prevDay = "";
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Unterhaltung mit ${otherName}`}>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
        <Link href={backHref} className="grid size-9 place-items-center text-muted hover:text-ink md:hidden" aria-label="Zurück zur Übersicht">
          <ArrowLeft size={18} />
        </Link>
        {group ? (
          <button type="button" onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <GroupAvatar avatars={group.members.filter((p) => !p.me).slice(0, 2).map((p) => ({ name: p.displayName, avatarUrl: p.avatarUrl }))} size={38} />
            <span className="min-w-0">
              <span className="block truncate font-semibold hover:underline">{group.title}</span>
              <span className="block truncate text-xs text-muted">
                {group.members.filter((p) => !p.pending).length} Mitglieder · {group.members.filter((p) => !p.me && !p.pending).map((p) => p.displayName.split(" ")[0]).slice(0, 4).join(", ")}
              </span>
            </span>
          </button>
        ) : thread.other ? (
          <Link href={`/u/${thread.other.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative inline-block shrink-0">
              <Avatar src={thread.other.avatarUrl} name={otherName} size={36} />
              {presence?.online && <OnlineDot size={10} decorative />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold hover:underline">{otherName}</span>
              {presenceLabel(presence) ? (
                <span className={cn("block truncate text-xs", presence?.online ? "font-medium text-online-ink" : "text-muted")} suppressHydrationWarning>
                  {presenceLabel(presence)}
                </span>
              ) : (
                <span className="block truncate text-xs text-muted">@{thread.other.handle}{thread.kind === "ORDER" ? " · Käufer↔Verkäufer" : ""}</span>
              )}
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
            <button type="button" onClick={loadOlder} disabled={pending} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-muted hover:border-rule-strong hover:text-ink">
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
                  <p className="my-5 flex items-center gap-3 spec" role="separator" suppressHydrationWarning>
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(m.createdAt)}
                    <span className="h-px flex-1 bg-line" />
                  </p>
                )}
                <Bubble
                  m={m}
                  otherName={otherName}
                  onReport={() => setReportId(m.id)}
                  showTime={showTime}
                  status={m.mine && !m.system && !m.removed ? messageStatus(m.createdAt, receipts) : null}
                  sender={group && !m.mine && !m.system && (i === 0 || messages[i - 1]!.senderId !== m.senderId || messages[i - 1]!.system || sep) ? (people.get(m.senderId) ?? { displayName: "Ehemaliges Mitglied", avatarUrl: null, handle: "" }) : null}
                />
                {lastMine?.id === m.id && (
                  // Für Screenreader: Status der letzten eigenen Nachricht ansagen, wenn er sich ändert
                  <p className={cn("mt-0.5 text-right text-[11px] text-muted", !otherPending && "sr-only")} aria-live="polite">
                    {otherPending ? "Als Kontaktanfrage zugestellt" : { sent: "Gesendet", delivered: "Zugestellt", read: group ? "Von allen gelesen" : "Gelesen" }[messageStatus(m.createdAt, receipts)]}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {newBelow && (
          <button type="button" onClick={() => scrollToBottom(true)} className="sticky bottom-2 left-full ml-auto mt-2 flex items-center gap-1.5 rounded-full bg-moss px-3.5 py-1.5 text-xs font-semibold text-paper shadow-float">
            <ArrowDown size={13} /> Neue Nachrichten
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite" role="status">{announce}</p>

      {isRequest && group && (
        <div className="border-t border-line bg-sunken px-4 py-3">
          <p className="text-sm">Du wurdest in die Gruppe <strong className="font-semibold">{group.title}</strong> eingeladen. Erst wenn du annimmst, sehen die anderen, dass du dabei bist.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => respond(true)}>Beitreten</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}>Ablehnen</Button>
          </div>
        </div>
      )}
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
            : group
              ? "In dieser Gruppe ist sonst niemand mehr."
              : thread.other?.declined
              ? "Diese Unterhaltung ist geschlossen."
              : !thread.other?.active
                ? "Dieses Konto kann derzeit keine Nachrichten empfangen."
                : undefined
        }
        placeholder={isRequest ? (group ? "Schreiben tritt der Gruppe bei …" : "Antworten nimmt die Anfrage an …") : `Nachricht an ${otherName} …`}
      />

      {group && <GroupInfo open={infoOpen} onClose={() => setInfoOpen(false)} conversationId={thread.id} group={group} />}
      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="MESSAGE" targetId={reportId} />}
      {thread.other && <ReportDialog open={reportUser} onClose={() => setReportUser(false)} targetType="USER" targetId={thread.other.id} />}
    </section>
  );
}
