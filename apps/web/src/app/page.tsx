import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { CATEGORIES, PROJECT_STATUS_LABEL, DIFFICULTY_LABEL, listCategories, categoryBySlug } from "@werkraum/shared";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { MarketingHeader, MarketingFooter } from "@/components/landing/marketing-chrome";
import { ThreadStory } from "@/components/landing/thread-story";
import { LinkButton } from "@/components/ui/button";
import { Cover } from "@/components/ui/media";
import { Glyph } from "@/components/ui/glyphs";
import { Avatar, Difficulty } from "@/components/ui/misc";
import { pad } from "@/lib/utils";
import { BRAND } from "@/config/brand";

export const metadata = { alternates: { canonical: "/" } };

export const revalidate = 300;

async function landingData() {
  try {
    // Nur Inhalte aktiver Konten – Projekte gebannter oder gelöschter Konten führen sonst ins Leere (404)
    const visible = { state: "PUBLISHED", visibility: "PUBLIC", owner: { status: "ACTIVE" } } as const;
    const [projects, tutorials, creators, catCounts, latest] = await Promise.all([
      db.project.count({ where: visible }),
      db.tutorial.count({ where: { state: "PUBLISHED", author: { status: "ACTIVE" } } }),
      db.userProfile.count({ where: { projectCount: { gt: 0 }, user: { status: "ACTIVE" } } }),
      db.project.groupBy({ by: ["category"], where: visible, _count: true }),
      db.project.findMany({
        where: { ...visible, status: { not: "ARCHIVED" } },
        orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
        take: 7,
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          coverUrl: true,
          difficulty: true,
          status: true,
          remixCount: true,
          _count: { select: { updates: true, tutorials: true } },
          owner: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
        },
      }),
    ]);
    return { projects, tutorials, creators, catCounts: new Map(catCounts.map((c) => [c.category, c._count])), latest };
  } catch {
    return { projects: 0, tutorials: 0, creators: 0, catCounts: new Map<string, number>(), latest: [] };
  }
}

function Chapter({ n, kicker, title, children, aside }: { n: string; kicker: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="px-5 py-14 sm:px-8 lg:py-0 lg:pl-[max(2rem,calc((100vw-1400px)/2+2rem))] lg:pr-16">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm text-clay">{n}</span>
        <span className="h-px w-10 bg-rule-strong" />
        <span className="spec text-ink">{kicker}</span>
      </div>
      <h2 className="display mt-6 max-w-xl text-[2.6rem] text-balance sm:text-6xl">{title}</h2>
      <div className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-2 text-pretty">{children}</div>
      {aside && <div className="mt-10 max-w-md">{aside}</div>}
    </section>
  );
}

const ZAHLWORT = ["Null", "Eine", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Elf", "Zwölf", "Dreizehn", "Vierzehn", "Fünfzehn", "Sechzehn", "Siebzehn", "Achtzehn", "Neunzehn", "Zwanzig"];
/** „Fünfzehn Werkstätten“ – aus der Zahl aktiver Kategorien (Admins können Kategorien abschalten). */
function werkstaetten(n: number) {
  const word = ZAHLWORT[n] ?? String(n);
  return n === 1 ? `${word} Werkstatt` : `${word} Werkstätten`;
}

export default async function Landing() {
  if (await currentUser()) redirect("/feed");
  const d = await landingData();
  const feeBps = await getSetting("commerce.feeBps").catch(() => 600);
  const fee = (Number(feeBps) / 100).toLocaleString("de-CH");

  const hero = (
    <section className="px-5 pb-10 pt-6 sm:px-8 lg:py-20 lg:pl-[max(2rem,calc((100vw-1400px)/2+2rem))] lg:pr-16 lg:pt-20">
      <p className="spec flex items-center gap-3 text-ink">
        <span className="inline-block size-1.5 bg-clay rounded-full" />
        Das soziale Netzwerk für Selbstgemachtes
      </p>
      <h1 className="display mt-7 text-[3.4rem] leading-[0.95] sm:text-7xl xl:text-[6.2rem]">
        Ein Faden.
        <br />
        <em className="not-italic text-moss">Unzählige</em> Projekte.
      </h1>
      <p className="mt-8 max-w-md text-[18px] leading-relaxed text-ink-2 text-pretty">
        {BRAND.name} verbindet Menschen, die mit ihren Händen erschaffen – mit Projekten, die wachsen, Anleitungen, die bleiben, und einem Marktplatz für echtes Handwerk.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <LinkButton href="/registrieren" size="lg">
          Kostenlos beitreten <ArrowRight size={16} />
        </LinkButton>
        <LinkButton href="/entdecken" size="lg" variant="outline">
          Erst einmal stöbern
        </LinkButton>
      </div>
      <dl className="mt-14 grid max-w-md grid-cols-3 border-t border-rule pt-4">
        {[
          ["Projekte", d.projects],
          ["Anleitungen", d.tutorials],
          ["Creator", d.creators],
        ].map(([l, v]) => (
          <div key={l as string}>
            <dt className="spec">{l}</dt>
            <dd className="mt-1 font-mono text-2xl num">{new Intl.NumberFormat("de-CH").format(v as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-10 hidden items-center gap-2 spec lg:flex">
        <span className="inline-block h-6 w-px animate-pulse bg-rule-strong" /> Scrollen, um den Faden zu verfolgen
      </p>
    </section>
  );

  const chapters = [
    <Chapter key="1" n="01" kicker="Entdecken" title="Inspiration, die nicht im Feed verschwindet.">
      <p>
        Folge Creatorn, Techniken und Materialien. Dein Feed mischt Frisches, deine Interessen und kleine Ateliers – nicht nur die Lautesten. Und
        alles, was du speicherst, bleibt auffindbar.
      </p>
    </Chapter>,
    <Chapter
      key="2"
      n="02"
      kicker="Erschaffen"
      title="Dokumentiere Schicht für Schicht."
      aside={
        <ol className="border-l border-rule">
          {[
            ["Tag 1", "Ton geknetet, Boden aufgebaut", "Meilenstein"],
            ["Tag 3", "Wülste bis zur Schulter – Riss am Rand", "Problem"],
            ["Tag 4", "Schlicker + Feuchttuch hat geholfen", "Lösung"],
          ].map(([day, text, tag]) => (
            <li key={day} className="relative py-3 pl-6">
              <span className="absolute -left-[5px] top-[18px] size-[9px] rounded-full border border-rule bg-paper" />
              <span className="spec">{day} · {tag}</span>
              <span className="block text-[15px] font-medium">{text}</span>
            </li>
          ))}
        </ol>
      }
    >
      <p>
        Wie ein Gefäss in Wulsttechnik wächst dein Projekt Eintrag für Eintrag: Fotos, Meilensteine, Probleme und Lösungen – im Projektjournal. Fortschritte
        teilst du mit einem Klick im Feed.
      </p>
    </Chapter>,
    <Chapter
      key="3"
      n="03"
      kicker="Teilen"
      title="Aus Erfahrung wird eine Anleitung."
      aside={
        <ul className="divide-y divide-line border-y border-line">
          {[
            ["Beine auf 45 cm ablängen", true],
            ["Zapfenlöcher bohren – Schutzbrille!", true],
            ["Sitzfläche verleimen", false],
          ].map(([t, done], i) => (
            <li key={i} className="flex items-center gap-3 py-3 text-[15px]">
              <span className={`grid size-5 place-items-center rounded-md border ${done ? "border-moss bg-moss text-paper" : "border-line-strong"}`}>{done && <Check size={12} />}</span>
              <span className="font-mono text-xs text-muted">{pad(i + 1)}</span>
              <span className={done ? "text-muted line-through decoration-1" : ""}>{t as string}</span>
            </li>
          ))}
        </ul>
      }
    >
      <p>
        Strukturierte Schritte, Materiallisten und klare Sicherheitshinweise. Andere haken Schritte ab, stellen Fragen und übernehmen die Materialliste direkt in
        ihre Einkaufsliste.
      </p>
    </Chapter>,
    <Chapter key="4" n="04" kicker="Gemeinsam wachsen" title="Alles hängt am Projektfaden.">
      <p>
        Beiträge, Journal, Anleitung, Produkt und Nachbauten verbinden sich zu einem einzigen Faden. Vom Entdecken geht es direkt zum Lernen, Nachbauen – oder
        Kaufen. Wer nachbaut, nennt das Original. Immer.
      </p>
    </Chapter>,
  ];

  return (
    <div className="bg-paper">
      <MarketingHeader />
      <main id="main">
        <ThreadStory hero={hero} chapters={chapters} />

        {/* Frisch von der Werkbank */}
        <section className="border-t border-rule bg-paper">
          <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="spec text-ink">Fig. 05 — Live aus der Community</p>
                <h2 className="display mt-4 text-5xl sm:text-6xl">Frisch von der Werkbank.</h2>
              </div>
              <LinkButton href="/projekte" variant="outline">
                Alle Projekte <ArrowRight size={15} />
              </LinkButton>
            </div>
            {d.latest.length > 0 ? (
              <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
                {d.latest.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/u/${p.owner.profile?.handle}/${p.slug}`}
                    className={`group block ${i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}
                  >
                    <div className="crop">
                      <Cover url={p.coverUrl} alt={p.title} seed={p.id} category={p.category} ratio={i === 0 ? "1/1" : "4/5"} sizes="(min-width:1024px) 25vw, 50vw" />
                    </div>
                    <div className="mt-3 flex items-center justify-between spec">
                      <span>{categoryBySlug(p.category)?.short} · {PROJECT_STATUS_LABEL[p.status]}</span>
                      <Difficulty level={p.difficulty} />
                    </div>
                    <h3 className={`headline mt-1.5 group-hover:underline decoration-1 underline-offset-4 ${i === 0 ? "text-3xl" : "text-xl"}`}>{p.title}</h3>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                      <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? ""} size={20} />
                      {p.owner.profile?.displayName}
                      <span className="ml-auto font-mono text-[11px]">
                        {p._count.updates} Einträge{p._count.tutorials ? " · Anleitung" : ""}{p.remixCount ? ` · ${p.remixCount} Nachbauten` : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-12 text-muted">Die ersten Projekte entstehen gerade.</p>
            )}
          </div>
        </section>

        {/* Kategorien – Inhaltsverzeichnis */}
        <section className="border-t border-line bg-sunken">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_2fr] lg:py-28">
            <div>
              <p className="spec text-ink">Inhaltsverzeichnis</p>
              <h2 className="display mt-4 text-5xl">{werkstaetten(listCategories({ activeOnly: true }).length)} unter einem Dach.</h2>
              <p className="mt-5 max-w-sm leading-relaxed text-ink-2">
                Wir starten mit Häkeln, Stricken und Nähen – und bauen von Anfang an für Holz, Keramik, 3D-Druck, Elektronik und alles, was Hände erschaffen.
              </p>
            </div>
            <ol className="border-t border-rule">
              {listCategories({ activeOnly: true }).map((c, i) => (
                <li key={c.slug}>
                  <Link href={`/entdecken?kategorie=${c.slug}`} className="group grid grid-cols-[2.5rem_2rem_1fr_auto] items-center gap-3 border-b border-line py-3.5 transition-colors hover:bg-paper sm:px-3">
                    <span className="font-mono text-xs text-muted">{pad(i + 1)}</span>
                    <Glyph name={c.glyph} size={24} className="text-ink transition-transform group-hover:rotate-[-8deg]" strokeWidth={1.6} />
                    <span className="text-[17px] font-medium">
                      {c.name}
                      {c.focus && <span className="ml-3 align-middle font-mono text-[10px] uppercase tracking-[0.12em] text-clay">Startschwerpunkt</span>}
                    </span>
                    <span className="flex items-center gap-3 font-mono text-xs text-muted">
                      {d.catCounts.get(c.slug) ?? 0}
                      <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Prinzipien */}
        <section className="border-t border-rule bg-paper">
          <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:py-28">
            <p className="spec text-ink">Werkstattordnung</p>
            <h2 className="display mt-4 max-w-3xl text-5xl sm:text-6xl">Wir bauen ein Netzwerk, das sich wie eine gute Werkstatt anfühlt.</h2>
            <div className="mt-16 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden">
              {[
                ["Menschen zuerst", "Der Feed ist der Mittelpunkt. Der Shop ergänzt die Community – er dominiert sie nie."],
                ["Qualität vor Lautstärke", "Sortiert wird nach Frische, Relevanz und Vielfalt. Kleine Creator werden nicht systematisch übersehen."],
                ["Dein Werk bleibt deins", "Du behältst die Rechte an deinen Inhalten. Nachbauten nennen das Original – sichtbar."],
                [`Faire ${fee} %`, `Einstellen ist kostenlos. Erst bei einem Verkauf fallen ${fee} % Provision an – transparent vor jeder Transaktion.`],
              ].map(([t, b], i) => (
                <div key={t} className="bg-paper p-7">
                  <span className="font-mono text-xs text-clay">§ {i + 1}</span>
                  <h3 className="headline mt-6 text-2xl">{t}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-ink bg-ink text-paper">
          <div className="mx-auto grid max-w-[1400px] items-end gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[2fr_1fr] lg:py-28">
            <h2 className="display text-5xl sm:text-7xl">
              Was entsteht als Nächstes <em className="not-italic text-clay-soft">auf deiner</em> Werkbank?
            </h2>
            <div>
              <p className="max-w-sm leading-relaxed text-paper/75">
                Ein Konto für alles: entdecken, dokumentieren, Anleitungen schreiben, bloggen – und wenn du magst, verkaufen. {DIFFICULTY_LABEL[1]} oder Profi: Du bist willkommen.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/registrieren" size="lg" variant="clay">
                  Konto erstellen <ArrowRight size={16} />
                </LinkButton>
                <Link href="/entdecken" className="inline-flex h-12 items-center px-2 text-[15px] font-semibold text-paper underline-offset-4 hover:underline rounded-xl">
                  Zuerst stöbern
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
