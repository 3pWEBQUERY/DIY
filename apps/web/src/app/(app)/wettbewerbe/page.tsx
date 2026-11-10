import type { Metadata } from "next";
import { currentUser } from "@/server/auth/session";
import { listCompetitions } from "@/server/communities/competitions";
import { Page, PageHeader } from "@/components/shell/page";
import { CompetitionCard } from "@/components/communities/competition-card";
import { Empty, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Wettbewerbe", description: `Wettbewerbe aus den ${BRAND.name}-Communities: Projekt einreichen, abstimmen, gewinnen.` };
export const dynamic = "force-dynamic";

/** Übersicht aller laufenden, kommenden und kürzlich entschiedenen Wettbewerbe. */
export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<{ community?: string }> }) {
  const [viewer, sp] = await Promise.all([currentUser(), searchParams]);
  const all = (await listCompetitions(viewer, { includeEnded: !!sp.community })).filter((c) => !sp.community || c.community.slug === sp.community);
  const running = all.filter((c) => c.phase === "open" || c.phase === "voting" || c.phase === "jury");
  const upcoming = all.filter((c) => c.phase === "upcoming");
  const ended = all.filter((c) => c.phase === "ended").sort((a, b) => (b.resultsAt?.getTime() ?? 0) - (a.resultsAt?.getTime() ?? 0));
  const communityName = sp.community ? all[0]?.community.name : null;

  const Grid = ({ items }: { items: typeof all }) => (
    <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <li key={c.id}>
          <CompetitionCard c={c} showCommunity={!sp.community} />
        </li>
      ))}
    </ul>
  );
  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  return (
    <Page width="wide">
      <PageHeader
        kicker={communityName ? `Communities · ${communityName}` : "Communities · Wettbewerbe"}
        title="Wettbewerbe"
        description="Reiche ein eigenes Projekt ein, stimme für deine Favoriten und sieh, wer gewinnt. Mitmachen können Mitglieder der jeweiligen Community."
        actions={<LinkButton href="/communities" variant="outline">Communities entdecken</LinkButton>}
      />
      {all.length === 0 && <Empty title="Gerade keine Wettbewerbe" body="Moderator:innen können in ihrer Community unter „Verwalten“ einen Wettbewerb anlegen." />}
      {running.length > 0 && (
        <section className="mb-12" aria-labelledby="w-run">
          <SectionTitle n={num()} title={<span id="w-run">Läuft gerade</span>} />
          <Grid items={running} />
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="mb-12" aria-labelledby="w-next">
          <SectionTitle n={num()} title={<span id="w-next">Demnächst</span>} />
          <Grid items={upcoming} />
        </section>
      )}
      {ended.length > 0 && (
        <section aria-labelledby="w-done">
          <SectionTitle n={num()} title={<span id="w-done">Entschieden</span>} />
          <Grid items={ended} />
        </section>
      )}
    </Page>
  );
}
