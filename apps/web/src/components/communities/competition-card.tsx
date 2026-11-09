import Link from "next/link";
import { Gift, Trophy, Users } from "lucide-react";
import { PHASE_LABEL, type CompetitionPhase } from "@/server/communities/competitions";
import { cn, formatDate } from "@/lib/utils";

const TONE: Record<CompetitionPhase, string> = {
  upcoming: "bg-sunken text-ink-2",
  open: "bg-moss text-paper",
  voting: "bg-clay text-paper",
  jury: "bg-ink text-paper",
  ended: "bg-sunken text-ink-2",
};

export type CompetitionCardData = {
  id: string;
  title: string;
  description: string;
  prize: string;
  phase: CompetitionPhase;
  startsAt: Date;
  endsAt: Date;
  votingEndsAt: Date | null;
  resultsAt: Date | null;
  entryCount: number;
  community: { slug: string; name: string };
};

const day = (d: Date) => formatDate(d, { day: "numeric", month: "short" });

/** Wettbewerbskarte für Übersichten: Phase, Frist, Community, Teilnahme, Preis. */
export function CompetitionCard({ c, showCommunity = true }: { c: CompetitionCardData; showCommunity?: boolean }) {
  const when =
    c.phase === "upcoming" ? `ab ${day(c.startsAt)}` : c.phase === "open" ? `Einreichung bis ${day(c.endsAt)}` : c.phase === "voting" && c.votingEndsAt ? `Abstimmung bis ${day(c.votingEndsAt)}` : c.phase === "jury" ? "Jury entscheidet" : c.resultsAt ? `Ergebnis ${day(c.resultsAt)}` : "Beendet";
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition-colors hover:border-rule-strong">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold", TONE[c.phase])}>
          <Trophy size={12} aria-hidden /> {PHASE_LABEL[c.phase]}
        </span>
        <span className="text-[12.5px] text-muted">{when}</span>
      </div>
      <h3 className="mt-4 text-[17px] font-semibold leading-snug tracking-[-0.01em]">
        <Link href={`/c/${c.community.slug}/wettbewerbe/${c.id}`} className="after:absolute after:inset-0 after:rounded-2xl group-hover:underline decoration-1 underline-offset-[3px]">
          {c.title}
        </Link>
      </h3>
      {c.description && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.description}</p>}
      <div className="min-h-4 flex-1" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3.5 text-[12.5px] text-muted">
        {showCommunity && <span className="font-medium text-ink-2">{c.community.name}</span>}
        <span className="inline-flex items-center gap-1">
          <Users size={13} aria-hidden /> {c.entryCount} {c.entryCount === 1 ? "Einreichung" : "Einreichungen"}
        </span>
        {c.prize && (
          <span className="inline-flex min-w-0 items-center gap-1 text-clay-ink">
            <Gift size={13} aria-hidden /> <span className="truncate">{c.prize}</span>
          </span>
        )}
      </div>
    </article>
  );
}
