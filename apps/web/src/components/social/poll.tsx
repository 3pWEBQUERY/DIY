"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { PostView } from "@/server/social/posts";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { votePollAction } from "@/app/(app)/social-actions";
import { callAction } from "@/lib/use-action";

type Poll = NonNullable<PostView["poll"]>;

function remaining(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Beendet";
  const h = Math.round(ms / 3600_000);
  if (h < 1) return "Endet in Kürze";
  if (h < 24) return `Noch ${h} ${h === 1 ? "Stunde" : "Stunden"}`;
  const d = Math.round(h / 24);
  return `Noch ${d} ${d === 1 ? "Tag" : "Tage"}`;
}

/**
 * Umfrage im Beitrag. Einfachauswahl stimmt mit einem Klick ab, Mehrfachauswahl per Button.
 * Ergebnisse erscheinen nach der eigenen Stimme bzw. nach Ende.
 */
export function PollBlock({ postId, poll: initial, signedIn }: { postId: string; poll: Poll; signedIn: boolean }) {
  const [poll, setPoll] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const canVote = signedIn && !poll.ended && poll.viewerVotes.length === 0;
  const max = Math.max(1, ...poll.options.map((o) => o.votes ?? 0));

  function vote(ids: string[]) {
    start(async () => {
      const r = await callAction(() => votePollAction(postId, ids));
      if (r.ok && r.data) setPoll(r.data);
      else if (!r.ok) toast(r.error, "error");
    });
  }

  return (
    <fieldset className="mt-3 space-y-2" aria-label="Umfrage" disabled={pending}>
      {poll.options.map((o) => {
        const mine = poll.viewerVotes.includes(o.id);
        if (poll.showResults && !canVote) {
          const pct = poll.voterCount ? Math.round(((o.votes ?? 0) / poll.voterCount) * 100) : 0;
          const leading = (o.votes ?? 0) === max && (o.votes ?? 0) > 0;
          return (
            <div key={o.id} className="relative overflow-hidden rounded-2xl border border-line bg-card">
              <div className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", mine ? "bg-moss-soft" : "bg-sunken")} style={{ width: `${pct}%` }} aria-hidden />
              <div className="relative flex items-center gap-2 px-4 py-2.5 text-[14.5px]">
                <span className={cn("min-w-0 flex-1 truncate", leading && "font-semibold")}>{o.label}</span>
                {mine && <Check size={15} className="shrink-0 text-moss" aria-label="Deine Stimme" />}
                <span className="num shrink-0 text-[13px] font-semibold tabular-nums">{pct} %</span>
              </div>
            </div>
          );
        }
        const on = picked.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={poll.multiple ? "checkbox" : "radio"}
            aria-checked={on}
            disabled={!canVote}
            onClick={() => {
              if (!poll.multiple) return vote([o.id]);
              setPicked((p) => (on ? p.filter((x) => x !== o.id) : [...p, o.id]));
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[14.5px] transition-colors",
              on ? "border-moss bg-moss-soft" : "border-line-strong bg-card hover:border-moss",
              !canVote && "cursor-default hover:border-line-strong",
            )}
          >
            <span className={cn("grid size-[18px] shrink-0 place-items-center border", poll.multiple ? "rounded-md" : "rounded-full", on ? "border-moss bg-moss text-paper" : "border-rule-strong")} aria-hidden>
              {on && <Check size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">{o.label}</span>
          </button>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[13px] text-muted">
        <span>
          {poll.voterCount} {poll.voterCount === 1 ? "Stimme" : "Stimmen"} · {remaining(poll.endsAt)}
          {poll.multiple && " · Mehrfachauswahl"}
        </span>
        {canVote && poll.multiple && (
          <Button size="sm" onClick={() => vote(picked)} disabled={!picked.length || pending}>
            Abstimmen
          </Button>
        )}
        {!signedIn && !poll.ended && (
          <Link href={`/anmelden?weiter=/beitrag/${postId}`} className="font-semibold text-ink underline underline-offset-2">
            Anmelden zum Abstimmen
          </Link>
        )}
        {canVote && !poll.multiple && !poll.showResults && <span>Ergebnis nach deiner Stimme</span>}
      </div>
    </fieldset>
  );
}
