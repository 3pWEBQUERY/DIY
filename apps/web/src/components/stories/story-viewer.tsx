"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, Eye, EyeOff, Ban, Flag, Heart, Loader2, Pause, Play, Send, Star, Trash2, User, Users, Volume2, VolumeX, X } from "lucide-react";
import type { StoryGroup, StoryItem } from "@/server/stories/service";
import { Avatar } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { MoreMenu, ReportDialog, type MenuItem } from "@/components/social/actions";
import { cn } from "@/lib/utils";
import { blockAction } from "@/app/(app)/social-actions";
import { callAction } from "@/lib/use-action";
import { deleteStoryAction, markStorySeenAction, storyGroupAction, storyLikeAction, storyMuteAction, storyReplyAction } from "@/app/(app)/stories/actions";
import { StoryMedia, StoryText } from "./story-content";
import { markStoriesChanged, restoreStoryOpenerFocus, takeStoryReturn } from "./story-return";
import { StoryViewersDialog } from "./story-viewers-dialog";
import { HighlightPickerDialog } from "./highlight-picker";

/** „jetzt“, „12 Min.“, „3 Std.“ – Story-Alter wie üblich knapp. */
function age(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "jetzt";
  if (s < 3600) return `${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `${Math.floor(s / 3600)} Std.`;
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "short", timeZone: "Europe/Zurich" });
}

type Viewer = { id: string; handle: string } | null;

/**
 * Story-Betrachter im Vollbild. Tippen links/rechts blättert, Gedrückthalten pausiert,
 * nach unten Wischen schliesst, seitlich Wischen springt zur nächsten Person.
 * Tastatur: ← → blättern, Leertaste pausiert, Esc schliesst.
 */
export function StoryViewer({ initial, sequence, viewer }: { initial: StoryGroup; sequence: string[]; viewer: Viewer }) {
  const router = useRouter();
  // Gruppen parallel zur Reihenfolge: undefined = noch nicht geladen, null = nicht (mehr) verfügbar
  const [groups, setGroups] = useState<(StoryGroup | null | undefined)[]>(() => sequence.map((_, i) => (i === 0 ? initial : undefined)));
  const [gi, setGi] = useState(0);
  const [ii, setIi] = useState(initial.startIndex);
  const [holding, setHolding] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [overlay, setOverlay] = useState<null | "viewers" | "highlight" | "report" | "menu">(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, startSend] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const loading = useRef(new Set<number>());
  /** Gruppe, die gerade nachgeladen wird – nach dem Laden bei der ersten neuen Story beginnen */
  const pendingStart = useRef<number | null>(null);

  const group = groups[gi] ?? null;
  const item: StoryItem | null = group?.items[ii] ?? null;
  const isVideo = item?.media?.kind === "VIDEO" && !!item.media.video;
  const paused = holding || userPaused || typing || busy || overlay !== null;

  // ── Schliessen ──
  const close = useCallback(() => {
    // Fokus nach dem Schliessen wieder auf den Link, der den Betrachter geöffnet hat (WCAG 2.4.3)
    restoreStoryOpenerFocus(rootRef.current);
    const back = takeStoryReturn();
    if (back) router.back();
    else router.push(viewer ? "/feed" : "/");
  }, [router, viewer]);

  // ── Gruppen laden ──
  const load = useCallback(
    async (i: number) => {
      if (i < 0 || i >= sequence.length || loading.current.has(i)) return;
      loading.current.add(i);
      const r = await callAction(() => storyGroupAction(sequence[i]!));
      if (!r.ok && r.code === "UNAVAILABLE" && pendingStart.current !== i) {
        // Nur vorab geladen und Netz weg: offen lassen – beim Hinblättern wird erneut geladen
        loading.current.delete(i);
        return;
      }
      if (!r.ok && r.code === "UNAVAILABLE") toast(r.error, "error");
      setGroups((g) => {
        const next = [...g];
        next[i] = r.ok ? r.data : null;
        return next;
      });
    },
    [sequence],
  );

  useEffect(() => {
    if (groups[gi + 1] === undefined) void load(gi + 1);
  }, [gi, groups, load]);

  const goGroup = useCallback(
    (dir: 1 | -1) => {
      let j = gi + dir;
      while (j >= 0 && j < sequence.length && groups[j] === null) j += dir;
      if (j < 0) {
        setIi(0);
        elapsed.current = 0;
        return;
      }
      if (j >= sequence.length) return close();
      const g = groups[j];
      if (g === undefined) {
        pendingStart.current = j;
        void load(j);
        setGi(j);
        setIi(0);
        return;
      }
      setGi(j);
      setIi(dir === 1 && g ? g.startIndex : 0);
    },
    [gi, groups, sequence.length, close, load],
  );

  // Nachgeladene Gruppe ohne Stories überspringen; nach dem Laden zur ersten neuen Story springen
  useEffect(() => {
    const g = groups[gi];
    if (g === null) goGroup(1);
    else if (g && pendingStart.current === gi) {
      pendingStart.current = null;
      setIi(g.startIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups[gi]]);

  const next = useCallback(() => {
    if (!group) return;
    if (ii < group.items.length - 1) setIi(ii + 1);
    else goGroup(1);
  }, [group, ii, goGroup]);

  const prev = useCallback(() => {
    if (ii > 0) setIi(ii - 1);
    else goGroup(-1);
  }, [ii, goGroup]);

  // Adresse mitführen (teilen, neu laden)
  useEffect(() => {
    if (!group) return;
    const url = group.mode === "highlight" ? `/highlights/${group.key.slice(2)}` : `/stories/${group.author.handle}`;
    if (window.location.pathname !== url) window.history.replaceState(window.history.state, "", url);
  }, [group]);

  // ── Neue Story: Zeit zurücksetzen, als gesehen melden ──
  useEffect(() => {
    elapsed.current = 0;
    // Text und noch nicht fertige Medien laufen sofort; Fotos/Videos sobald geladen (spätestens nach 4 s)
    setMediaReady(item?.kind === "TEXT" || item?.media?.state !== "READY");
    const fallback = setTimeout(() => setMediaReady(true), 4000);
    if (barRef.current) barRef.current.style.transform = "scaleX(0)";
    if (item && viewer && !item.viewer.own && !item.viewer.seen) {
      void callAction(() => markStorySeenAction(item.id));
      markStoriesChanged();
      setGroups((gs) => gs.map((g, idx) => (idx === gi && g ? { ...g, items: g.items.map((s) => (s.id === item.id ? { ...s, viewer: { ...s.viewer, seen: true } } : s)) } : g)));
    }
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // ── Zeitgeber (Fotos/Text) bzw. Fortschritt des Videos ──
  useEffect(() => {
    if (!item || paused || !mediaReady) return;
    const v = videoRef.current;
    if (isVideo && v) {
      v.muted = muted;
      v.play().catch(() => {
        // Ohne Nutzergeste nur stumm erlaubt
        setMuted(true);
        v.muted = true;
        void v.play().catch(() => {});
      });
    }
    let raf = 0;
    let last = performance.now();
    const total = item.durationSec * 1000;
    const tick = (t: number) => {
      if (isVideo && v) {
        elapsed.current = v.currentTime * 1000;
        if (v.ended) return next();
      } else {
        elapsed.current += t - last;
      }
      last = t;
      const p = Math.min(1, elapsed.current / total);
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      if (p >= 1) return next();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v?.pause();
    };
  }, [item, paused, mediaReady, isVideo, muted, next]);

  // Videos neu von vorne
  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [item?.id]);

  // ── Tastatur, Hintergrund-Tab, Scrollsperre ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (overlay || target?.closest?.("input, textarea, select, [contenteditable]")) return;
      // Leertaste auf Schaltflächen/Links löst deren eigene Aktion aus – nicht zusätzlich pausieren
      if (e.key === " " && target?.closest?.("button, a, [role=menuitem], [role=button]")) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") close();
      else if (e.key === " ") {
        e.preventDefault();
        setUserPaused((p) => !p);
      }
    };
    const onVis = () => setUserPaused((p) => p || document.hidden);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      document.body.style.overflow = overflow;
    };
  }, [next, prev, close, overlay]);

  // ── Modal: Hintergrund inert, Fokus hinein und beim Verlassen zurück ──
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    // Alles ausserhalb des Betrachters (Navigation, Kopfzeile, Sprunglink …) unerreichbar machen.
    // Ausgenommen: Dialoge und Popover (Bestätigung, Toasts), die aus dem Betrachter heraus geöffnet werden.
    const made: HTMLElement[] = [];
    for (let el: HTMLElement | null = root; el && el !== document.body; el = el.parentElement) {
      const parent: HTMLElement | null = el.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children) as Element[]) {
        if (sib === el || !(sib instanceof HTMLElement) || sib.inert) continue;
        if (sib.matches("dialog, [popover], script, style, next-route-announcer") || sib.querySelector("dialog[open]")) continue;
        sib.inert = true;
        made.push(sib);
      }
    }
    return () => {
      made.forEach((m) => (m.inert = false));
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const ready = !!group && !!item;
  const focused = useRef(false);
  useEffect(() => {
    if (!ready || focused.current) return;
    focused.current = true;
    const root = rootRef.current;
    if (!root || root.contains(document.activeElement)) return;
    // Pausieren-Schaltfläche (Leertaste wirkt dann wie gewohnt), sonst erstes sichtbares Bedienelement
    const first =
      root.querySelector<HTMLElement>("[data-autofocus]") ??
      Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input")).find((el) => el.getClientRects().length > 0 && !el.classList.contains("sr-only"));
    first?.focus({ preventScroll: true });
  }, [ready]);

  // ── Tippen, Halten, Wischen ──
  const gesture = useRef<{ x: number; y: number; t: number; hold: ReturnType<typeof setTimeout> | null } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const hold = setTimeout(() => setHolding(true), 200);
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), hold };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.hold) clearTimeout(g.hold);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const wasHold = holding;
    setHolding(false);
    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) return close();
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) return goGroup(dx < 0 ? 1 : -1);
    if (wasHold || Date.now() - g.t > 450) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  };
  const onPointerCancel = () => {
    if (gesture.current?.hold) clearTimeout(gesture.current.hold);
    gesture.current = null;
    setHolding(false);
  };

  // ── Aktionen ──
  const patchItem = (id: string, f: (s: StoryItem) => StoryItem) => setGroups((gs) => gs.map((g) => (g ? { ...g, items: g.items.map((s) => (s.id === id ? f(s) : s)) } : g)));

  async function toggleLike() {
    if (!item || !viewer) return;
    const liked = !item.viewer.liked;
    patchItem(item.id, (s) => ({ ...s, viewer: { ...s.viewer, liked } }));
    const r = await callAction(() => storyLikeAction(item.id, liked));
    if (!r.ok) {
      patchItem(item.id, (s) => ({ ...s, viewer: { ...s.viewer, liked: !liked } }));
      toast(r.error, "error");
    }
  }

  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !reply.trim() || sending) return;
    const body = reply.trim();
    startSend(async () => {
      const r = await callAction(() => storyReplyAction(item.id, body));
      if (r.ok) {
        setReply("");
        (document.activeElement as HTMLElement | null)?.blur();
        toast(r.data.asRequest ? "Als Kontaktanfrage gesendet." : "Antwort gesendet.");
      } else toast(r.error, "error");
    });
  }

  async function remove() {
    if (!item || !group) return;
    setBusy(true);
    const ok = await confirmDialog({ title: "Story löschen?", body: "Sie verschwindet sofort aus dem Story-Kreis, deinem Archiv und allen Highlights." });
    setBusy(false);
    if (!ok) return;
    const r = await callAction(() => deleteStoryAction(item.id));
    if (!r.ok) return toast(r.error, "error");
    toast("Story gelöscht.");
    const left = group.items.filter((s) => s.id !== item.id);
    if (!left.length) {
      setGroups((gs) => gs.map((g, idx) => (idx === gi ? null : g)));
      return close();
    }
    setGroups((gs) => gs.map((g, idx) => (idx === gi && g ? { ...g, items: left } : g)));
    setIi(Math.min(ii, left.length - 1));
  }

  async function muteStories() {
    if (!group) return;
    const r = await callAction(() => storyMuteAction(group.author.id, true));
    if (!r.ok) return toast(r.error, "error");
    toast(`Stories von ${group.author.displayName} sind ausgeblendet. Rückgängig im Profilmenü.`);
    setGroups((gs) => gs.map((g, idx) => (idx === gi ? null : g)));
    goGroup(1);
  }

  async function blockAuthor() {
    if (!group) return;
    const name = group.author.displayName;
    if (!(await confirmDialog(`${name} blockieren? Ihr seht gegenseitig keine Stories, Beiträge und Nachrichten mehr.`))) return;
    const r = await callAction(() => blockAction(group.author.id, true));
    if (!r.ok) return toast(r.error, "error");
    toast(`${name} ist blockiert.`);
    markStoriesChanged();
    setGroups((gs) => gs.map((g, idx) => (idx === gi ? null : g)));
    goGroup(1);
  }

  if (!group || !item) {
    return (
      <div ref={rootRef} className="fixed inset-0 z-[100] grid place-items-center bg-[#151312] text-white">
        <Loader2 className="animate-spin" aria-label="Wird geladen" />
      </div>
    );
  }

  const own = item.viewer.own;
  const menu: MenuItem[] = own
    ? [{ label: "Story löschen", icon: <Trash2 size={15} />, danger: true, onSelect: remove }]
    : viewer
      ? [
          { label: "Profil ansehen", icon: <User size={15} />, onSelect: () => router.push(`/u/${group.author.handle}`) },
          ...(group.mode === "stories" ? [{ label: `Stories von ${group.author.displayName.split(" ")[0]} ausblenden`, icon: <EyeOff size={15} />, onSelect: muteStories }] : []),
          { label: "Story melden", icon: <Flag size={15} />, onSelect: () => setOverlay("report") },
          { label: `${group.author.displayName.split(" ")[0]} blockieren`, icon: <Ban size={15} />, danger: true, onSelect: blockAuthor },
        ]
      : [{ label: "Profil ansehen", icon: <User size={15} />, onSelect: () => router.push(`/u/${group.author.handle}`) }];

  const hasPrevGroup = groups.slice(0, gi).some((g) => g !== null);
  const iconBtn = "grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-white";
  /** Steuerung auf der Bühne: dunkle Fläche, damit sie auch auf hellen Fotos und Papier lesbar bleibt */
  const stageBtn = "grid size-9 place-items-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/50 focus-visible:outline-white";

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-[#151312] text-white" role="dialog" aria-modal="true" aria-label={group.mode === "highlight" ? `Highlight ${group.title}` : `Stories von ${group.author.displayName}`}>
      {/* Schliessen (Desktop, ausserhalb der Bühne) */}
      <button type="button" onClick={close} className={cn(iconBtn, "absolute right-4 top-4 hidden sm:grid")} aria-label="Stories schliessen">
        <X size={22} aria-hidden />
      </button>

      {/* Vorherige / nächste Person (Desktop) */}
      <button type="button" onClick={prev} disabled={ii === 0 && !hasPrevGroup} className={cn(iconBtn, "mr-4 hidden size-11 bg-white/10 disabled:opacity-0 sm:grid")} aria-label="Vorherige Story">
        <ChevronLeft size={22} aria-hidden />
      </button>

      <div className="@container relative h-[100dvh] w-full overflow-hidden bg-black sm:h-[min(92dvh,880px)] sm:w-auto sm:aspect-[9/16] sm:rounded-3xl">
        {/* Inhalt */}
        {item.kind === "TEXT" ? (
          <StoryText text={item.text} background={item.background} />
        ) : item.media && item.media.state === "READY" ? (
          <StoryMedia key={item.id} ref={videoRef} media={item.media} alt={item.alt} muted={muted} onLoaded={() => setMediaReady(true)} />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-10 text-center">
            {item.media?.state === "FAILED" ? (
              <p className="text-sm text-white/85">{item.media.error ?? "Diese Datei konnte nicht verarbeitet werden."} Lösche die Story und versuche es mit einer anderen Datei.</p>
            ) : (
              <div className="flex flex-col items-center gap-3 text-sm text-white/85">
                <Loader2 className="animate-spin" aria-hidden />
                Das Video wird verarbeitet – deine Story erscheint, sobald es fertig ist.
              </div>
            )}
          </div>
        )}

        {/* Für Screenreader auf kleinen Bildschirmen (dort fehlen die Pfeile neben der Bühne) */}
        <button type="button" onClick={prev} className="sr-only sm:hidden">Vorherige Story</button>
        <button type="button" onClick={next} className="sr-only sm:hidden">Nächste Story</button>

        {/* Tipp- und Wischfläche */}
        <div
          className="absolute inset-0 z-10 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={(e) => gesture.current && onPointerUp(e)}
          onContextMenu={(e) => e.preventDefault()}
          aria-hidden
        />

        {/* Kopf: Fortschritt, Person, Steuerung */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1" aria-hidden>
            {group.items.map((s, idx) => (
              <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/50 outline outline-1 -outline-offset-1 outline-black/20">
                {idx < ii ? (
                  <span className="block h-full w-full bg-white" />
                ) : idx === ii ? (
                  <span ref={barRef} className="block h-full w-full origin-left bg-white" style={{ transform: "scaleX(0)" }} />
                ) : null}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <Link href={`/u/${group.author.handle}`} className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full bg-black/35 py-1 pl-1 pr-3.5 transition-colors hover:bg-black/50">
              <Avatar src={group.author.avatarUrl} name={group.author.displayName} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-tight">{group.mode === "highlight" ? group.title : group.author.displayName}</span>
                <span className="flex items-center gap-1.5 text-[12px] leading-tight text-white/80" suppressHydrationWarning>
                  {group.mode === "highlight" ? `@${group.author.handle}` : age(item.createdAt)}
                  {item.visibility === "FOLLOWERS" && (
                    <span className="inline-flex items-center gap-1" title="Nur für Follower">
                      · <Users size={12} aria-hidden /> Follower
                    </span>
                  )}
                  {own && item.expired && <span>· archiviert</span>}
                </span>
              </span>
            </Link>
            <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
              {isVideo && (
                <button type="button" onClick={() => setMuted((m) => !m)} className={stageBtn} aria-label={muted ? "Ton an" : "Ton aus"}>
                  {muted ? <VolumeX size={19} aria-hidden /> : <Volume2 size={19} aria-hidden />}
                </button>
              )}
              <button type="button" data-autofocus onClick={() => setUserPaused((p) => !p)} className={stageBtn} aria-label={userPaused ? "Fortsetzen" : "Pausieren"}>
                {userPaused ? <Play size={19} aria-hidden /> : <Pause size={19} aria-hidden />}
              </button>
              <MoreMenu items={menu} label="Story-Optionen" triggerClassName={stageBtn} onOpenChange={(o) => setOverlay((cur) => (o ? "menu" : cur === "menu" ? null : cur))} />
              <button type="button" onClick={close} className={cn(stageBtn, "sm:hidden")} aria-label="Stories schliessen">
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* Fuss: Bildunterschrift, Projektfaden, Antworten bzw. eigene Statistik */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 space-y-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {item.kind === "MEDIA" && item.text && (
            <p className="mx-auto w-fit max-w-full whitespace-pre-line rounded-2xl bg-black/55 px-4 py-2.5 text-center text-[15px] leading-snug">{item.text}</p>
          )}
          {item.project && (
            <Link
              href={`/u/${item.project.handle}/${item.project.slug}`}
              className="pointer-events-auto mx-auto flex max-w-[22rem] items-center gap-3 rounded-2xl bg-card p-2 pr-3 text-ink"
            >
              <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-sunken">
                {item.project.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.project.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="spec block">Projekt</span>
                <span className="block truncate text-[14px] font-semibold">{item.project.title}</span>
              </span>
              <ArrowUpRight size={16} className="shrink-0 text-muted" aria-hidden />
            </Link>
          )}

          {own ? (
            <div className="pointer-events-auto flex items-center gap-2">
              <button type="button" onClick={() => setOverlay("viewers")} className="inline-flex h-11 items-center gap-2 rounded-full bg-black/35 px-4 text-[14px] font-semibold transition-colors hover:bg-black/50">
                <Eye size={18} aria-hidden /> {item.stats?.views ?? 0} <span className="font-normal text-white/80">gesehen</span>
                {(item.stats?.likes ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 pl-1 font-normal text-white/80">
                    · <Heart size={14} className="fill-current" aria-hidden /> {item.stats?.likes}
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setOverlay("highlight")} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-black/35 px-4 text-[14px] font-semibold transition-colors hover:bg-black/50">
                <Star size={16} aria-hidden /> Highlight
              </button>
            </div>
          ) : viewer ? (
            <form onSubmit={sendReply} className="pointer-events-auto flex items-center gap-2">
              <label htmlFor="story-reply" className="sr-only">Antwort an {group.author.displayName}</label>
              <input
                id="story-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value.slice(0, 1000))}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                placeholder={`Antworten an ${group.author.displayName.split(" ")[0]} …`}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-full border border-white/35 bg-black/35 px-4 text-[15px] text-white outline-none placeholder:text-white/80 focus:border-white focus:bg-black/50"
              />
              {reply.trim() ? (
                <button type="submit" disabled={sending} className={cn(iconBtn, "size-11 bg-moss hover:bg-moss-ink")} aria-label="Antwort senden">
                  {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />}
                </button>
              ) : (
                <button type="button" onClick={toggleLike} aria-pressed={item.viewer.liked} className={cn(stageBtn, "size-11")} aria-label={item.viewer.liked ? "Herz entfernen" : "Story mit Herz markieren"}>
                  <Heart size={24} className={cn("transition-transform", item.viewer.liked && "scale-110 fill-moss text-moss")} aria-hidden />
                </button>
              )}
            </form>
          ) : (
            <Link href={`/anmelden?weiter=/stories/${group.author.handle}`} className="pointer-events-auto flex h-11 items-center justify-center rounded-full border border-white/35 bg-black/35 text-[14px] font-semibold hover:bg-black/50">
              Anmelden, um zu antworten
            </Link>
          )}
        </div>

      </div>

      <button type="button" onClick={next} className={cn(iconBtn, "ml-4 hidden size-11 bg-white/10 sm:grid")} aria-label="Nächste Story">
        <ChevronRight size={22} aria-hidden />
      </button>

      <p className="sr-only" aria-live="polite">
        Story {ii + 1} von {group.items.length}
      </p>

      {own && <StoryViewersDialog open={overlay === "viewers"} storyId={item.id} onClose={() => setOverlay(null)} />}
      {own && <HighlightPickerDialog open={overlay === "highlight"} storyId={item.id} onClose={() => setOverlay(null)} />}
      {!own && viewer && <ReportDialog open={overlay === "report"} onClose={() => setOverlay(null)} targetType="STORY" targetId={item.id} />}
    </div>
  );
}
