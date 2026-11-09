"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { LikeButton, SaveButton, ShareButton, MoreMenu, useSafetyMenu } from "@/components/social/actions";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { markTutorialVersionSeenAction } from "@/app/(app)/anleitungen/actions";
import { callAction } from "@/lib/use-action";

/** Aktionsleiste einer Anleitung: Gefällt mir, Merken, Teilen, Melden bzw. Bearbeiten. */
export function TutorialActions({
  tutorial,
  author,
  viewer,
  likes,
}: {
  tutorial: { id: string; title: string; href: string };
  author: { id: string; displayName: string };
  viewer: { signedIn: boolean; isOwner: boolean; liked: boolean; saved: boolean };
  likes: number;
}) {
  const safety = useSafetyMenu({ targetType: "TUTORIAL", targetId: tutorial.id, authorId: author.id, authorName: author.displayName });
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-line py-3">
      <LikeButton type="TUTORIAL" id={tutorial.id} liked={viewer.liked} count={likes} />
      <SaveButton type="TUTORIAL" id={tutorial.id} saved={viewer.saved} label />
      <ShareButton url={tutorial.href} title={tutorial.title} />
      <div className="ml-auto flex items-center gap-2">
        {viewer.isOwner ? (
          <Link href={`/studio/anleitungen/${tutorial.id}`} className={buttonClass("outline", "sm")}>
            <Pencil size={14} /> Bearbeiten
          </Link>
        ) : (
          viewer.signedIn && <MoreMenu items={safety.items} label="Weitere Aktionen zur Anleitung" />
        )}
      </div>
      {safety.dialog}
    </div>
  );
}

/** „Neue Version verfügbar“ – für Lesende mit Fortschritt aus einer älteren Version. */
export function VersionBanner({ tutorialId, version, changeNote, isMajor, publishedAt }: { tutorialId: string; version: number; changeNote: string; isMajor: boolean; publishedAt: string }) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  return (
    <div role="status" className="flex flex-wrap items-start gap-4 border border-moss bg-moss-soft px-5 py-4 rounded-2xl">
      <div className="min-w-0 flex-1">
        <p className="spec text-moss-ink">
          Neue Version verfügbar · v{version}
          {isMajor ? " · wesentliche Änderung" : ""} · {new Date(publishedAt).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="mt-1 text-[15px] text-ink">
          {changeNote || "Die Anleitung wurde überarbeitet."} <span className="text-muted">Dein Fortschritt bleibt erhalten – geänderte Schritte prüfst du am besten noch einmal.</span>
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await callAction(() => markTutorialVersionSeenAction(tutorialId));
            if (r.ok) setHidden(true);
            else toast(r.error, "error");
          })
        }
        className={buttonClass("outline", "sm")}
      >
        Verstanden
      </button>
    </div>
  );
}
