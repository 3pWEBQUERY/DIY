"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, LogOut } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { joinCommunityAction, leaveCommunityAction } from "@/app/(app)/communities/actions";

type State = "ACTIVE" | "PENDING" | "INVITED" | "BANNED" | null;

/** Beitritts-Schaltfläche mit korrektem Zustand je Sichtbarkeit und Mitgliedschaft. */
export function JoinButton({
  communityId,
  slug,
  visibility,
  state: initial,
  isOwner,
  loggedIn,
}: {
  communityId: string;
  slug: string;
  visibility: "PUBLIC" | "REQUEST" | "PRIVATE";
  state: State;
  isOwner?: boolean;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial);
  const [pending, start] = useTransition();
  const [hoverLeave, setHoverLeave] = useState(false);

  if (!loggedIn) {
    return (
      <LinkButton href={`/anmelden?weiter=${encodeURIComponent(`/c/${slug}`)}`} variant="ink">
        {visibility === "PUBLIC" ? "Beitreten" : "Beitritt anfragen"}
      </LinkButton>
    );
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: { state: string | null } }>, msg?: (s: State) => string | undefined) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        const next = (r.data?.state ?? null) as State;
        setState(next);
        const m = msg?.(next);
        if (m) toast(m);
        router.refresh();
      } else toast(r.error ?? "Fehler", "error");
    });

  const join = () =>
    run(
      () => joinCommunityAction(communityId),
      (s) => (s === "ACTIVE" ? "Willkommen in der Community!" : s === "PENDING" ? "Anfrage gesendet. Die Moderation entscheidet bald." : undefined),
    );
  const leave = (confirmText: string, done: string) => confirm(confirmText) && run(() => leaveCommunityAction(communityId), () => done);

  if (state === "BANNED") return <Button variant="outline" disabled>Kein Beitritt möglich</Button>;

  if (state === "ACTIVE") {
    if (isOwner) return <Button variant="outline" disabled aria-label="Du leitest diese Community"><Check size={14} /> Du leitest</Button>;
    return (
      <Button
        variant="outline"
        disabled={pending}
        onMouseEnter={() => setHoverLeave(true)}
        onMouseLeave={() => setHoverLeave(false)}
        onFocus={() => setHoverLeave(true)}
        onBlur={() => setHoverLeave(false)}
        onClick={() => leave("Community verlassen?", "Du hast die Community verlassen.")}
        aria-label="Mitglied – klicken zum Austreten"
        className="min-w-32"
      >
        {hoverLeave ? <><LogOut size={14} /> Austreten</> : <><Check size={14} /> Mitglied</>}
      </Button>
    );
  }

  if (state === "PENDING") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => leave("Beitrittsanfrage zurückziehen?", "Anfrage zurückgezogen.")} aria-label="Angefragt – klicken zum Zurückziehen" className="min-w-32">
        <Clock size={14} /> Angefragt
      </Button>
    );
  }

  if (state === "INVITED") {
    return (
      <div className="flex gap-2">
        <Button variant="ink" disabled={pending} onClick={join}>Einladung annehmen</Button>
        <Button variant="ghost" disabled={pending} onClick={() => leave("Einladung ablehnen?", "Einladung abgelehnt.")}>Ablehnen</Button>
      </div>
    );
  }

  return (
    <Button variant="ink" disabled={pending} onClick={join} className="min-w-32">
      {visibility === "PUBLIC" ? "Beitreten" : "Beitritt anfragen"}
    </Button>
  );
}
