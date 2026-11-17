"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { StoryTray as TrayData } from "@/server/stories/service";
import { cn } from "@/lib/utils";
import { StoryAvatar } from "./story-avatar";
import { StoryComposer } from "./story-composer";
import { consumeStoriesChanged, rememberStoryReturn } from "./story-return";
import { storyTrayAction } from "@/app/(app)/stories/actions";

/**
 * Story-Kreis oben im Feed: eigene Story (mit Plus zum Erstellen) und die aktiven Stories der
 * Profile, denen du folgst – Neues zuerst, Gesehenes danach mit grauem Ring.
 */
export function StoryTray({ tray: initial, projects }: { tray: TrayData; projects: { id: string; title: string }[] }) {
  const [composer, setComposer] = useState(false);
  const [tray, setTray] = useState(initial);
  useEffect(() => setTray(initial), [initial]);
  // Zurück aus dem Betrachter (Seite aus dem Router-Cache): gesehene Stories grau zeigen
  useEffect(() => {
    if (consumeStoriesChanged()) void storyTrayAction().then(setTray);
  }, []);
  if (!tray.enabled || !tray.own) return null;
  const own = tray.own;
  const hasOwn = own.count > 0;

  return (
    <section aria-label="Stories" className="-mx-4 mb-7 sm:mx-0">
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1 pt-0.5 scrollbar-none sm:gap-4 sm:px-0">
        <li className="relative w-[76px] shrink-0">
          {hasOwn ? (
            <Link href={`/stories/${own.author.handle}`} onClick={rememberStoryReturn} className="group flex flex-col items-center gap-1.5 rounded-2xl outline-offset-4" aria-label={`Deine Story ansehen (${own.count})`}>
              <StoryAvatar src={own.author.avatarUrl} name={own.author.displayName} size={62} state="seen" className="group-hover:border-rule-strong" />
              <span className="w-full truncate text-center text-[12px] text-ink">Deine Story</span>
            </Link>
          ) : (
            <button type="button" onClick={() => setComposer(true)} className="group flex w-full flex-col items-center gap-1.5 rounded-2xl outline-offset-4" aria-label="Story erstellen">
              <StoryAvatar src={own.author.avatarUrl} name={own.author.displayName} size={62} state="none" />
              <span className="w-full truncate text-center text-[12px] text-ink">Deine Story</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setComposer(true)}
            aria-label="Neue Story erstellen"
            className="absolute left-[50px] top-[48px] grid size-[22px] place-items-center rounded-full border-2 border-paper bg-moss text-paper transition-colors hover:bg-moss-ink"
          >
            <Plus size={13} strokeWidth={3} aria-hidden />
          </button>
        </li>
        {tray.items.map((it) => (
          <li key={it.author.id} className="w-[76px] shrink-0">
            <Link
              href={`/stories/${it.author.handle}`}
              onClick={rememberStoryReturn}
              className="group flex flex-col items-center gap-1.5 rounded-2xl outline-offset-4"
              aria-label={`Story von ${it.author.displayName}${it.unseen ? `, ${it.unseen} neu` : ", gesehen"}`}
            >
              <StoryAvatar src={it.author.avatarUrl} name={it.author.displayName} size={62} state={it.unseen ? "unseen" : "seen"} />
              <span className={cn("w-full truncate text-center text-[12px]", it.unseen ? "font-semibold text-ink" : "text-muted")}>{it.author.displayName.split(" ")[0]}</span>
            </Link>
          </li>
        ))}
        {tray.items.length === 0 && (
          <li className="flex min-w-0 items-center self-start pt-5 pl-1 pr-4">
            <p className="max-w-[18rem] text-[13px] leading-snug text-muted">
              Stories von Profilen, denen du folgst, erscheinen hier – 24 Stunden lang.
            </p>
          </li>
        )}
      </ul>
      <StoryComposer open={composer} onClose={() => setComposer(false)} projects={projects} />
    </section>
  );
}
