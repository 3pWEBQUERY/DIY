"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Link2, Mail, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { PeoplePicker, type Candidate } from "@/components/messages/people-picker";
import { groupCandidatesAction, startConversationAction } from "@/app/(app)/nachrichten/actions";
import { cn } from "@/lib/utils";
import { SHARE_LOGOS, type ShareLogo } from "./share-logos.data";

/**
 * Eigenes Teilen-Menü (statt des System-Dialogs): Werkuno-Nachricht, WhatsApp, Nachrichten,
 * E-Mail, Instagram, Telegram, Facebook, X, LinkedIn, Pinterest, Threads, Reddit und Link kopieren.
 * Auf dem Handy als Sheet von unten, am Desktop als Dialog.
 */

type Target = {
  key: string;
  label: string;
  /** Kachel: Markenlogo (weiss auf Markenfarbe) oder eigenes Symbol */
  logo?: ShareLogo;
  icon?: React.ReactNode;
  bg?: string;
  href?: (s: Share) => string;
  onSelect?: () => void;
  show?: (env: Env) => boolean;
};

type Share = { url: string; title: string; text: string };
type Env = { apple: boolean; mobile: boolean };

const enc = encodeURIComponent;
const MAX_RECIPIENTS = 10;

function detectEnv(): Env {
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod|Macintosh/.test(ua);
  return { apple, mobile: /iPhone|iPad|iPod|Android/.test(ua) || (apple && navigator.maxTouchPoints > 1) };
}

const LINK_TARGETS: Target[] = [
  { key: "whatsapp", label: "WhatsApp", logo: "whatsapp", href: (s) => `https://wa.me/?text=${enc(`${s.text}\n${s.url}`)}` },
  {
    key: "sms",
    label: "Nachrichten",
    icon: <MessageCircle size={24} strokeWidth={1.9} className="fill-white/15" />,
    bg: "#34C759",
    // iOS/macOS: sms:&body=, Android: sms:?body=
    href: (s) => `sms:${/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? "&" : "?"}body=${enc(`${s.text} ${s.url}`)}`,
    show: (e) => e.mobile || e.apple,
  },
  { key: "mail", label: "E-Mail", icon: <Mail size={23} strokeWidth={1.9} />, bg: "#3D393C", href: (s) => `mailto:?subject=${enc(s.title)}&body=${enc(`${s.text}\n\n${s.url}`)}` },
  { key: "telegram", label: "Telegram", logo: "telegram", href: (s) => `https://t.me/share/url?url=${enc(s.url)}&text=${enc(s.text)}` },
  { key: "facebook", label: "Facebook", logo: "facebook", href: (s) => `https://www.facebook.com/sharer/sharer.php?u=${enc(s.url)}` },
  { key: "x", label: "X", logo: "x", href: (s) => `https://x.com/intent/post?text=${enc(s.text)}&url=${enc(s.url)}` },
  { key: "linkedin", label: "LinkedIn", logo: "linkedin", href: (s) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(s.url)}` },
  { key: "pinterest", label: "Pinterest", logo: "pinterest", href: (s) => `https://www.pinterest.com/pin/create/button/?url=${enc(s.url)}&description=${enc(s.text)}` },
  { key: "threads", label: "Threads", logo: "threads", href: (s) => `https://www.threads.net/intent/post?text=${enc(`${s.text} ${s.url}`)}` },
  { key: "reddit", label: "Reddit", logo: "reddit", href: (s) => `https://www.reddit.com/submit?url=${enc(s.url)}&title=${enc(s.title)}` },
];

function Tile({ t, onClick, href }: { t: Target; onClick?: () => void; href?: string }) {
  const logo = t.logo ? SHARE_LOGOS[t.logo] : null;
  const face = (
    <>
      <span
        className="grid size-[52px] place-items-center rounded-2xl text-white transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95 motion-reduce:transform-none"
        style={{ background: t.key === "instagram" ? "linear-gradient(45deg,#FEDA75 0%,#FA7E1E 25%,#D62976 55%,#962FBF 80%,#4F5BD5 100%)" : (t.bg ?? logo?.color) }}
        aria-hidden
      >
        {logo ? (
          <svg viewBox="0 0 24 24" width={t.key === "x" || t.key === "threads" ? 21 : 25} height={t.key === "x" || t.key === "threads" ? 21 : 25} fill="currentColor">
            <path d={logo.d} />
          </svg>
        ) : (
          t.icon
        )}
      </span>
      <span className="mt-1.5 w-full truncate text-center text-[12px] leading-tight text-ink-2">{t.label}</span>
    </>
  );
  const cls = "group flex w-[76px] flex-col items-center rounded-2xl py-1 focus-visible:outline-2 focus-visible:outline-offset-2";
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={onClick} className={cls}>
      {face}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {face}
    </button>
  );
}

export function ShareSheet({ open, onClose, url, title, text, image }: { open: boolean; onClose: () => void; url: string; title: string; text?: string; image?: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"main" | "people" | "instagram">("main");
  const [copied, setCopied] = useState(false);
  const [env, setEnv] = useState<Env>({ apple: false, mobile: false });
  const [canNative, setCanNative] = useState(false);
  const full = useMemo(() => (typeof window === "undefined" ? url : new URL(url, location.origin).toString()), [url]);
  const share: Share = { url: full, title, text: text ?? title };

  useEffect(() => {
    setEnv(detectEnv());
    setCanNative(typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setView("main");
      setCopied(false);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const copy = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      if (!silent) toast("Link kopiert.");
      setTimeout(() => setCopied(false), 2400);
      return true;
    } catch {
      toast("Kopieren nicht möglich – markiere den Link und kopiere ihn manuell.", "error");
      return false;
    }
  };

  const own: Target[] = [
    { key: "werkuno", label: "Werkuno", icon: <Image src="/brand/werkuno-icon-192.png" alt="" width={52} height={52} className="size-[52px] rounded-2xl" />, bg: "transparent", onSelect: () => setView("people") },
    { key: "instagram", label: "Instagram", logo: "instagram", onSelect: () => void copy(true).then((ok) => ok && setView("instagram")) },
  ];
  const targets = [own[0]!, ...LINK_TARGETS.slice(0, 3), own[1]!, ...LINK_TARGETS.slice(3)].filter((t) => !t.show || t.show(env));

  const host = (() => {
    try {
      const u = new URL(full);
      return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
    } catch {
      return full;
    }
  })();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="share-title"
      className={cn(
        "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-full overflow-y-auto rounded-t-3xl border border-line bg-card p-0 text-ink open:animate-rise",
        "sm:m-auto sm:w-[27rem] sm:rounded-3xl",
      )}
    >
      {open && (
        <div className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-center gap-2 px-5 pb-3 pt-3 sm:pt-5">
            {view !== "main" && (
              <button type="button" onClick={() => setView("main")} className="-ml-2 grid size-9 place-items-center rounded-xl hover:bg-sunken" aria-label="Zurück">
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 id="share-title" className="flex-1 text-[17px] font-semibold">
              {view === "people" ? "Per Nachricht senden" : view === "instagram" ? "Auf Instagram teilen" : "Teilen"}
            </h2>
            <button type="button" onClick={onClose} className="-mr-2 grid size-9 place-items-center rounded-xl hover:bg-sunken" aria-label="Schliessen">
              <X size={18} />
            </button>
          </div>

          {/* Vorschau: was geteilt wird */}
          <div className="mx-5 flex items-center gap-3 rounded-2xl bg-sunken p-2.5">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-card text-muted">
                <Link2 size={18} />
              </span>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{title}</p>
              <p className="truncate text-[12px] text-muted">{host}</p>
            </div>
          </div>

          {view === "main" && (
            <>
              <ul className="grid grid-cols-4 justify-items-center gap-y-3 px-3 pt-5" aria-label="Teilen über">
                {targets.map((t) => (
                  <li key={t.key}>
                    <Tile t={t} href={t.href?.(share)} onClick={t.href ? onClose : t.onSelect} />
                  </li>
                ))}
              </ul>
              <div className="mx-5 mt-5 flex items-center gap-2 rounded-xl border border-line-strong bg-card py-1 pl-3.5 pr-1 focus-within:border-moss">
                <input readOnly value={full} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-2 outline-none" />
                <Button size="sm" variant={copied ? "outline" : "primary"} onClick={() => void copy()} className="shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Kopiert" : "Kopieren"}
                </Button>
              </div>
              {canNative && env.mobile && (
                <button
                  type="button"
                  onClick={() => navigator.share({ title, text: share.text, url: full }).then(onClose, () => {})}
                  className="mx-auto mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] text-muted hover:bg-sunken hover:text-ink"
                >
                  <MoreHorizontal size={15} /> Weitere Apps
                </button>
              )}
            </>
          )}

          {view === "instagram" && (
            <div className="px-5 pt-5">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-moss">
                <Check size={16} /> Link kopiert
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                Instagram erlaubt kein direktes Teilen von Links aus dem Browser. Öffne Instagram und füge den Link in einen Chat oder als Link-Sticker in deine Story ein.
              </p>
              <a href={env.mobile ? "https://www.instagram.com/direct/inbox/" : "https://www.instagram.com/"} target="_blank" rel="noopener noreferrer" onClick={onClose} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(45deg,#FA7E1E,#D62976 50%,#962FBF)" }}>
                <svg viewBox="0 0 24 24" width={17} height={17} fill="currentColor" aria-hidden>
                  <path d={SHARE_LOGOS.instagram.d} />
                </svg>
                Instagram öffnen
              </a>
            </div>
          )}

          {view === "people" && <SendToPeople url={full} onDone={onClose} />}
        </div>
      )}
    </dialog>
  );
}

function SendToPeople({ url, onDone }: { url: string; onDone: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [handles, setHandles] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void groupCandidatesAction().then((r) => {
      if (r.ok) setCandidates(r.data);
      else if (r.code === "UNAUTHENTICATED") setNeedsLogin(true);
      else setCandidates([]);
    });
  }, []);

  if (needsLogin)
    return (
      <div className="px-5 pt-5 text-[14px] text-muted">
        <p>Melde dich an, um Inhalte per Werkuno-Nachricht zu teilen.</p>
        <Link href={`/anmelden?weiter=${encodeURIComponent(location.pathname)}`} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-moss text-sm font-semibold text-paper">
          Anmelden
        </Link>
      </div>
    );

  const send = async () => {
    setSending(true);
    const body = [note.trim(), url].filter(Boolean).join("\n\n");
    const results = await Promise.all(handles.map((h) => startConversationAction({ recipientHandle: h, body }).then((r) => ({ h, r }))));
    setSending(false);
    const failed = results.filter((x) => !x.r.ok);
    const okCount = results.length - failed.length;
    if (okCount) toast(okCount === 1 ? "Gesendet." : `An ${okCount} Personen gesendet.`);
    if (failed.length) {
      const first = failed[0]!.r;
      toast(failed.length === 1 && !first.ok ? `@${failed[0]!.h}: ${first.error}` : `${failed.length} Nachrichten konnten nicht gesendet werden.`, "error");
      setHandles(failed.map((x) => x.h));
      return;
    }
    onDone();
  };

  return (
    <div className="px-5 pt-5">
      {candidates == null ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
          ))}
        </div>
      ) : (
        <PeoplePicker candidates={candidates} value={handles} onChange={setHandles} max={MAX_RECIPIENTS} />
      )}
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Nachricht hinzufügen (optional)" aria-label="Nachricht" className="mt-3" />
      <Button className="mt-3 w-full" disabled={!handles.length || sending} onClick={() => void send()}>
        {sending ? "Wird gesendet …" : handles.length > 1 ? `An ${handles.length} Personen senden` : "Senden"}
      </Button>
    </div>
  );
}
