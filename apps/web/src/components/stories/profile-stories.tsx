"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { HighlightSummary } from "@/server/stories/highlights";
import { cn } from "@/lib/utils";
import { HighlightCover } from "./highlight-cover";
import { consumeStoriesChanged, rememberStoryReturn } from "./story-return";

/** Profilbild mit Story-Ring (Koralle = neu, Haarlinie = gesehen) – öffnet die Stories. */
export function StoryAvatarLink({ handle, unseen, name, children }: { handle: string; unseen: boolean; name: string; children: ReactNode }) {
  const router = useRouter();
  // Zurück aus dem Betrachter: Ring „gesehen“ statt Stand aus dem Router-Cache
  useEffect(() => {
    if (consumeStoriesChanged()) router.refresh();
  }, [router]);
  return (
    <Link
      href={`/stories/${handle}`}
      onClick={rememberStoryReturn}
      aria-label={`Stories von ${name} ansehen${unseen ? " (neu)" : ""}`}
      className={cn(
        "-mt-14 ml-4 inline-block w-fit rounded-[22px] border-[3px] bg-paper p-[3px] transition-colors sm:-mt-16 sm:ml-8",
        unseen ? "border-moss" : "border-line-strong hover:border-rule-strong",
      )}
    >
      {children}
    </Link>
  );
}

/** Highlights unter dem Profilkopf: runde Titelbilder mit Namen; für dich selbst mit „Neu“. */
export function ProfileHighlights({ highlights, isSelf }: { highlights: HighlightSummary[]; isSelf: boolean }) {
  return (
    <section aria-label="Highlights" className="-mx-4 mb-10 sm:mx-0">
      <ul className="flex gap-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:gap-5 sm:px-0">
        {isSelf && (
          <li className="w-[76px] shrink-0">
            <Link href="/stories" className="group flex flex-col items-center gap-1.5 rounded-2xl outline-offset-4">
              <span className="grid size-[68px] place-items-center rounded-full border border-dashed border-line-strong text-muted transition-colors group-hover:border-rule-strong group-hover:text-ink">
                <Plus size={22} aria-hidden />
              </span>
              <span className="w-full truncate text-center text-[12px] text-muted group-hover:text-ink">{highlights.length ? "Verwalten" : "Highlight"}</span>
            </Link>
          </li>
        )}
        {highlights.map((h) => (
          <li key={h.id} className="w-[76px] shrink-0">
            <Link href={`/highlights/${h.id}`} onClick={rememberStoryReturn} className="group flex flex-col items-center gap-1.5 rounded-2xl outline-offset-4" aria-label={`Highlight ${h.title}, ${h.count} ${h.count === 1 ? "Story" : "Stories"}`}>
              <span className="rounded-full border border-line-strong p-[3px] transition-colors group-hover:border-rule-strong">
                <HighlightCover cover={h.cover} title={h.title} size={60} className="border-0" />
              </span>
              <span className="w-full truncate text-center text-[12px] font-semibold text-ink">{h.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
