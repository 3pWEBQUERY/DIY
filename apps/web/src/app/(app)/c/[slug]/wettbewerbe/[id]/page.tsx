import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Gift, Trophy, Users, Vote } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { entryProjectOptions, getCompetition, PHASE_LABEL, type CompetitionPhase } from "@/server/communities/competitions";
import { Page } from "@/components/shell/page";
import { ShareButton } from "@/components/social/actions";
import { EntriesGrid, EntryPanel, PlaceBadge } from "@/components/communities/competition";
import { ProjectCard } from "@/components/projects/project-card";
import { SectionTitle } from "@/components/ui/misc";
import { cn, formatDate, pluralize } from "@/lib/utils";

type Props = { params: Promise<{ slug: string; id: string }> };

const load = cache(async (id: string) => {
  const viewer = await currentUser();
  return { viewer, c: await getCompetition(id, viewer) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { c } = await load(id);
  if (!c) return { title: "Wettbewerb", robots: { index: false } };
  return { title: `${c.title} · Wettbewerb · ${c.community.name}`, description: c.description.slice(0, 160) || `Wettbewerb in ${c.community.name}` };
}

const PHASE_TONE: Record<CompetitionPhase, string> = {
  upcoming: "bg-sunken text-ink-2",
  open: "bg-moss text-paper",
  voting: "bg-clay text-paper",
  jury: "bg-ink text-paper",
  ended: "bg-sunken text-ink-2",
};

const day = (d: Date) => formatDate(d, { day: "numeric", month: "long" });
const daysUntil = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000));

/** Wettbewerb: Ablauf, Teilnahme, Einreichungen, Abstimmung und Ergebnis. */
export default async function CompetitionPage({ params }: Props) {
  const { slug, id } = await params;
  const { viewer, c } = await load(id);
  if (!c || c.community.slug !== slug) notFound();
  const options = viewer && c.phase === "open" && c.viewer.isMember ? await entryProjectOptions(viewer.id) : [];

  const deadline =
    c.phase === "upcoming"
      ? `Start am ${day(c.startsAt)}`
      : c.phase === "open"
        ? `Einreichung bis ${day(c.endsAt)} · noch ${pluralize(daysUntil(c.endsAt), "Tag", "Tage")}`
        : c.phase === "voting" && c.votingEndsAt
          ? `Abstimmung bis ${day(c.votingEndsAt)} · noch ${pluralize(daysUntil(c.votingEndsAt), "Tag", "Tage")}`
          : c.phase === "jury"
            ? "Die Jury wählt die Gewinner:innen"
            : c.resultsAt
              ? `Ergebnis vom ${day(c.resultsAt)}`
              : "Beendet";

  const steps = [
    { key: "open", label: "Einreichung", sub: `${day(c.startsAt)} – ${day(c.endsAt)}` },
    c.judging === "VOTES" ? { key: "voting", label: "Abstimmung", sub: c.votingEndsAt ? `bis ${day(c.votingEndsAt)}` : "" } : { key: "jury", label: "Jury", sub: "Moderation entscheidet" },
    { key: "ended", label: "Ergebnis", sub: c.resultsAt ? day(c.resultsAt) : "" },
  ];
  const order: CompetitionPhase[] = ["upcoming", "open", c.judging === "VOTES" ? "voting" : "jury", "ended"];
  const current = order.indexOf(c.phase);
  const winners = c.phase === "ended" ? c.entries.filter((e) => e.place).sort((a, b) => a.place! - b.place!) : [];

  return (
    <Page width="wide">
      <nav aria-label="Brotkrumen" className="mb-6 flex items-center gap-2 text-[13px] text-muted">
        <ArrowLeft size={14} aria-hidden />
        <Link href={`/c/${c.community.slug}`} className="hover:text-ink">
          {c.community.name}
        </Link>
        <span>/</span>
        <Link href="/wettbewerbe" className="hover:text-ink">
          Wettbewerbe
        </Link>
      </nav>

      <header className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-semibold", PHASE_TONE[c.phase])}>
              <Trophy size={13} aria-hidden /> {PHASE_LABEL[c.phase]}
            </span>
            <span className="text-muted">{deadline}</span>
          </p>
          <h1 className="display text-[2.2rem] text-balance [overflow-wrap:anywhere] sm:text-[2.8rem]">{c.title}</h1>
          {c.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{c.description}</p>}
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[14px]">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-muted" aria-hidden />
              <dt className="sr-only">Einreichungen</dt>
              <dd>
                <span className="num font-semibold">{c.entries.length}</span> {c.entries.length === 1 ? "Einreichung" : "Einreichungen"}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Vote size={16} className="text-muted" aria-hidden />
              <dt className="sr-only">Entscheidung</dt>
              <dd>{c.judging === "VOTES" ? "Die Community stimmt ab" : "Die Jury entscheidet"}</dd>
            </div>
            {c.prize && (
              <div className="flex items-center gap-2">
                <Gift size={16} className="text-clay" aria-hidden />
                <dt className="sr-only">Preis</dt>
                <dd className="font-semibold">{c.prize}</dd>
              </div>
            )}
          </dl>
          <div className="mt-6">
            <ShareButton variant="button" label url={`/c/${c.community.slug}/wettbewerbe/${c.id}`} title={`Wettbewerb: ${c.title}`} />
          </div>
        </div>
        <div className="space-y-4">
          <ol className="rounded-2xl border border-line bg-card p-5" aria-label="Ablauf">
            {steps.map((s, i) => {
              const idx = order.indexOf(s.key as CompetitionPhase);
              const done = current > idx;
              const now = current === idx;
              return (
                <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < steps.length - 1 && <span className={cn("absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px", done ? "bg-moss" : "bg-line-strong")} aria-hidden />}
                  <span className={cn("mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border-2", now ? "border-moss bg-moss" : done ? "border-moss bg-moss-soft" : "border-line-strong bg-card")} aria-hidden>
                    {now && <span className="size-1.5 rounded-full bg-paper" />}
                  </span>
                  <span>
                    <span className={cn("block text-[14px] font-semibold", !now && !done && "text-muted")}>{s.label}</span>
                    {s.sub && <span className="block text-[12.5px] text-muted">{s.sub}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <EntryPanel c={c} options={options} loggedIn={!!viewer} />
        </div>
      </header>

      {winners.length > 0 && (
        <section aria-labelledby="gewinner" className="mt-10">
          <SectionTitle n="★" title={<span id="gewinner">Gewinner:innen</span>} />
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {winners.map((w) => (
              <li key={w.id} className="flex flex-col">
                <PlaceBadge place={w.place!} className="mb-3 self-start" />
                <div>
                  <ProjectCard project={w.project!} ratio="4/3" />
                </div>
                {w.votes != null && <p className="mt-2 text-[13px] text-muted">{w.votes} {w.votes === 1 ? "Stimme" : "Stimmen"}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {c.rules && (
        <section aria-labelledby="regeln" className="mt-12 max-w-3xl">
          <SectionTitle n="01" title={<span id="regeln">Regeln</span>} />
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{c.rules}</p>
        </section>
      )}

      <section aria-labelledby="einreichungen" className="mt-12">
        <SectionTitle n={c.rules ? "02" : "01"} title={<span id="einreichungen">{c.phase === "ended" ? "Alle Einreichungen" : "Einreichungen"}</span>} />
        <div className="mt-6">
          <EntriesGrid c={c} />
        </div>
      </section>
    </Page>
  );
}
