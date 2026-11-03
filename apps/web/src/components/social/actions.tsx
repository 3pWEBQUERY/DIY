"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Bookmark, Share2, MoreHorizontal, Flag, EyeOff, VolumeX, Ban, Check, UserPlus } from "lucide-react";
import { REPORT_REASONS, REPORT_REASON_LABEL } from "@werkraum/shared";
import type { TargetType } from "@/generated/prisma/enums";
import { cn, compactNumber } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/field";
import { likeAction, bookmarkAction, reportAction, hideAction, muteAction, blockAction, followAction } from "@/app/(app)/social-actions";

function useAuthRedirect() {
  const router = useRouter();
  return (code?: string) => {
    if (code === "UNAUTHENTICATED") {
      router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  };
}

/** Optimistisches Gefällt-mir; Server ist idempotent. */
export function LikeButton({ type, id, liked: initial, count: initialCount, size = "md" }: { type: TargetType; id: string; liked: boolean; count: number; size?: "sm" | "md" }) {
  const [liked, setLiked] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [, start] = useTransition();
  const authRedirect = useAuthRedirect();
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Gefällt mir nicht mehr" : "Gefällt mir"}
      onClick={() => {
        const next = !liked;
        setLiked(next);
        setCount((c) => c + (next ? 1 : -1));
        start(async () => {
          const r = await likeAction(type, id, next);
          if (!r.ok) {
            setLiked(!next);
            setCount((c) => c + (next ? -1 : 1));
            if (!authRedirect(r.code)) toast(r.error, "error");
          }
        });
      }}
      className={cn("group inline-flex items-center gap-1.5 text-muted transition-colors hover:text-clay", liked && "text-clay", size === "sm" ? "text-xs" : "text-[13px]")}
    >
      <Heart size={size === "sm" ? 15 : 18} strokeWidth={1.7} className={cn("transition-transform group-active:scale-90", liked && "fill-clay")} />
      <span className="num font-medium">{count > 0 ? compactNumber(count) : ""}</span>
    </button>
  );
}

export function SaveButton({ type, id, saved: initial, label }: { type: TargetType; id: string; saved: boolean; label?: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [, start] = useTransition();
  const authRedirect = useAuthRedirect();
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Gespeichert – entfernen" : "Speichern"}
      onClick={() => {
        const next = !saved;
        setSaved(next);
        start(async () => {
          const r = await bookmarkAction(type, id, next);
          if (!r.ok) {
            setSaved(!next);
            if (!authRedirect(r.code)) toast(r.error, "error");
          } else if (next) toast("Gespeichert. Du findest es unter „Gespeichert“.");
        });
      }}
      className={cn("inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink", saved && "text-ink")}
    >
      <Bookmark size={18} strokeWidth={1.7} className={cn(saved && "fill-ink")} />
      {label && <span className="font-medium">{saved ? "Gespeichert" : "Speichern"}</span>}
    </button>
  );
}

export function ShareButton({ url, title }: { url: string; title: string }) {
  return (
    <button
      type="button"
      aria-label="Teilen"
      className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      onClick={async () => {
        const full = new URL(url, location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title, url: full });
            return;
          } catch {
            /* abgebrochen */
          }
        }
        await navigator.clipboard.writeText(full);
        toast("Link kopiert.");
      }}
    >
      <Share2 size={17} strokeWidth={1.7} />
    </button>
  );
}

export function FollowButton({ userId, following: initial, size = "md", className }: { userId: string; following: boolean; size?: "sm" | "md"; className?: string }) {
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  const authRedirect = useAuthRedirect();
  return (
    <Button
      variant={following ? "outline" : "ink"}
      size={size}
      disabled={pending}
      aria-pressed={following}
      className={cn("min-w-24", className)}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        start(async () => {
          const r = await followAction(userId, next);
          if (!r.ok) {
            setFollowing(!next);
            if (!authRedirect(r.code)) toast(r.error, "error");
          }
        });
      }}
    >
      {following ? (
        <>
          <Check size={14} /> Folge ich
        </>
      ) : (
        <>
          <UserPlus size={14} /> Folgen
        </>
      )}
    </Button>
  );
}

/** Meldedialog mit Gründen aus der Richtlinie (§24.1). */
export function ReportDialog({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: TargetType; targetId: string }) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [pending, start] = useTransition();
  const [caseNo, setCaseNo] = useState<number | null>(null);
  const authRedirect = useAuthRedirect();
  return (
    <Dialog open={open} onClose={() => { onClose(); setCaseNo(null); setReason(""); setDetails(""); }} title="Inhalt melden" description="Meldungen sind vertraulich. Wir prüfen sie nach unseren Community-Richtlinien.">
      {caseNo ? (
        <div className="space-y-4">
          <p className="text-[15px]">Danke für deine Meldung. Sie wurde unter der Fallnummer</p>
          <p className="font-mono text-3xl">#{String(caseNo).padStart(6, "0")}</p>
          <p className="text-sm text-muted">aufgenommen. Du wirst benachrichtigt, sobald eine Entscheidung vorliegt.</p>
          <Button onClick={onClose} className="w-full">Schliessen</Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason) return;
            start(async () => {
              const r = await reportAction({ targetType, targetId, reason, details });
              if (r.ok) setCaseNo(r.data.caseNumber ?? 0);
              else if (!authRedirect(r.code)) toast(r.error, "error");
            });
          }}
          className="space-y-4"
        >
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">Grund</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={cn("flex cursor-pointer items-center gap-2 border px-3 py-2.5 text-sm", reason === r ? "border-ink bg-sunken" : "border-line hover:border-line-strong")}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[#3D604C]" />
                  {REPORT_REASON_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="rep-details">Details (optional)</Label>
            <Textarea id="rep-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Was ist passiert? Bei Urheberrecht: Wo ist das Original?" />
          </div>
          <Button type="submit" className="w-full" disabled={!reason || pending}>Meldung absenden</Button>
        </form>
      )}
    </Dialog>
  );
}

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean };

/** Kontextmenü (Disclosure-Pattern, per Tastatur bedienbar). */
export function MoreMenu({ items, label = "Weitere Aktionen" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className="grid size-8 place-items-center text-muted hover:bg-sunken hover:text-ink">
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-9 z-30 min-w-56 border border-ink bg-card py-1 animate-rise">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn("flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-sunken", it.danger && "text-danger")}
              >
                {it.icon}
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Standard-Moderationsmenü für fremde Inhalte. */
export function useSafetyMenu(opts: { targetType: TargetType; targetId: string; authorId: string; authorName: string }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const authRedirect = useAuthRedirect();
  const run = async (p: Promise<{ ok: boolean; code?: string; error?: string; message?: string }>) => {
    const r = await p;
    if (r.ok) {
      if (r.message) toast(r.message);
      router.refresh();
    } else if (!authRedirect(r.code)) toast(r.error ?? "Fehler", "error");
  };
  const items: MenuItem[] = [
    { label: "Melden", icon: <Flag size={15} />, onSelect: () => setReportOpen(true) },
    { label: "Nicht interessiert", icon: <EyeOff size={15} />, onSelect: () => run(hideAction(opts.targetType, opts.targetId)) },
    { label: `${opts.authorName} stummschalten`, icon: <VolumeX size={15} />, onSelect: () => run(muteAction(opts.authorId, true)) },
    { label: `${opts.authorName} blockieren`, icon: <Ban size={15} />, danger: true, onSelect: () => confirm(`${opts.authorName} blockieren? Ihr könnt euch dann gegenseitig nicht mehr sehen oder kontaktieren.`) && run(blockAction(opts.authorId, true)) },
  ];
  const dialog = <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType={opts.targetType} targetId={opts.targetId} />;
  return { items, dialog };
}
