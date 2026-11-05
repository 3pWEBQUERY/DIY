import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { categoryOptions } from "@/server/categories/settings";
import { Page, PageHeader } from "@/components/shell/page";
import { Composer } from "@/components/social/composer";
import { Glyph } from "@/components/ui/glyphs";
import { pad } from "@/lib/utils";

export const metadata = { title: "Erstellen" };

const OPTIONS = [
  { key: "beitrag", glyph: "frame", title: "Beitrag", body: "Ein Foto, ein Video oder ein Gedanke – so schnell wie überall.", href: "/erstellen?typ=beitrag" },
  { key: "projekt", glyph: "layers", title: "Projekt", body: "Dokumentiere eine Arbeit mit Status, Materialien und Journal.", href: "/projekte/neu" },
  { key: "anleitung", glyph: "stitch", title: "Anleitung", body: "Strukturierte Schritte, Sicherheitshinweise und Materialliste.", href: "/studio/anleitungen/neu" },
  { key: "artikel", glyph: "fold", title: "Blogartikel", body: "Hintergrundwissen, Erfahrungsberichte, Materialkunde.", href: "/studio/blog/neu" },
  { key: "produkt", glyph: "ring", title: "Produkt", body: "Verkaufe ein Einzelstück, eine Kleinserie oder ein Materialset.", href: "/studio/produkte/neu" },
  { key: "community", glyph: "kite", title: "Community", body: "Gründe eine Gruppe für deine Technik oder deine Region.", href: "/communities/neu" },
];

/** Erstellen-Hub (§6.2 Nr. 3). Einfacher Einstieg zuerst: der Beitrag (§5.4). */
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ typ?: string; projekt?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/erstellen");
  if (sp.typ === "projekt") redirect("/projekte/neu");
  const projects = await db.project.findMany({ where: { ownerId: user.id, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } });

  return (
    <Page width="wide">
      <PageHeader kicker="Werkbank" title="Was möchtest du erstellen?" description="Alles beginnt mit einem Beitrag. Wenn daraus mehr wird, verbindest du ihn später mit einem Projekt, einer Anleitung oder einem Produkt." />
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="quick">
          <h2 id="quick" className="spec mb-3 text-ink">01 — Schnell teilen</h2>
          <Composer viewer={{ displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl }} projects={projects} defaultProjectId={sp.projekt} categories={await categoryOptions()} />
        </section>
        <section aria-labelledby="more">
          <h2 id="more" className="spec mb-3 text-ink">02 — Mehr erschaffen</h2>
          <ul className="divide-y divide-line border-y border-rule">
            {OPTIONS.filter((o) => o.key !== "beitrag").map((o, i) => (
              <li key={o.key}>
                <Link href={o.href} className="group grid grid-cols-[2rem_2.25rem_1fr_auto] items-center gap-3 py-4 hover:bg-card sm:px-2 rounded-2xl">
                  <span className="font-mono text-xs text-muted">{pad(i + 1)}</span>
                  <Glyph name={o.glyph} size={26} strokeWidth={1.6} />
                  <span>
                    <span className="block font-semibold">{o.title}</span>
                    <span className="block text-sm text-muted">{o.body}</span>
                  </span>
                  <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
