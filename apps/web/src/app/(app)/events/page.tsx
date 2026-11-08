import Link from "next/link";
import type { Metadata } from "next";
import { currentUser } from "@/server/auth/session";
import { eventsOverview } from "@/server/communities/events";
import { categoryOptions } from "@/server/categories/settings";
import { Page, PageHeader } from "@/components/shell/page";
import { EventCard } from "@/components/events/event-card";
import { Empty, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Events", description: "Treffen, Workshops und Tauschbörsen aus den Werkuno-Communities – vor Ort und online." };
export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ ort?: string; kategorie?: string }> }) {
  const sp = await searchParams;
  const viewer = await currentUser();
  const mode = sp.ort === "online" ? "ONLINE" : sp.ort === "vor-ort" ? "IN_PERSON" : null;
  const cats = await categoryOptions();
  const category = cats.some((c) => c.slug === sp.kategorie) ? sp.kategorie! : null;
  const { mine, communities, open } = await eventsOverview(viewer, { mode, category });
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { ort: sp.ort ?? null, kategorie: category, ...o };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/events${s ? `?${s}` : ""}`;
  };
  const pill = (on: boolean) => cn("rounded-full border px-3.5 py-1.5 text-[13px]", on ? "border-moss bg-moss font-semibold text-paper" : "border-line-strong bg-card hover:border-rule-strong");

  const Grid = ({ items }: { items: typeof open }) => (
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map((e) => (
        <li key={e.id}><EventCard e={e} /></li>
      ))}
    </ul>
  );

  return (
    <Page width="wide">
      <PageHeader
        kicker="Communities · Events"
        title="Events"
        description="Treffen, Workshops und Tauschbörsen aus den Communities – zum gemeinsamen Werkeln vor Ort oder online."
        actions={<LinkButton href="/communities" variant="outline">Communities entdecken</LinkButton>}
      />
      <div className="mb-8 flex flex-wrap gap-2">
        <Link href={q({ ort: null })} className={pill(!mode)}>Alle</Link>
        <Link href={q({ ort: "vor-ort" })} className={pill(mode === "IN_PERSON")}>Vor Ort</Link>
        <Link href={q({ ort: "online" })} className={pill(mode === "ONLINE")}>Online</Link>
        <span className="mx-1 w-px bg-line" aria-hidden />
        {cats.slice(0, 8).map((c) => (
          <Link key={c.slug} href={q({ kategorie: category === c.slug ? null : c.slug })} className={pill(category === c.slug)}>{c.short}</Link>
        ))}
      </div>

      {mine.length > 0 && (
        <section className="mb-12" aria-labelledby="ev-mine">
          <SectionTitle n="01" title={<span id="ev-mine">Deine nächsten Events</span>} />
          <Grid items={mine} />
        </section>
      )}
      {communities.length > 0 && (
        <section className="mb-12" aria-labelledby="ev-comm">
          <SectionTitle n={mine.length ? "02" : "01"} title={<span id="ev-comm">In deinen Communities</span>} />
          <Grid items={communities} />
        </section>
      )}
      <section aria-labelledby="ev-open">
        <SectionTitle n={String(1 + (mine.length ? 1 : 0) + (communities.length ? 1 : 0)).padStart(2, "0")} title={<span id="ev-open">{viewer ? "Weitere Events" : "Kommende Events"}</span>} />
        {open.length ? (
          <Grid items={open} />
        ) : (
          <Empty className="mt-4" title="Gerade nichts geplant" body="Events entstehen in den Communities. Gründe eine oder schlage in deiner Community ein Treffen vor." action={<LinkButton href="/communities" variant="outline">Zu den Communities</LinkButton>} />
        )}
      </section>
    </Page>
  );
}
