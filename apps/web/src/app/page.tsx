import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Layers, Lock, Percent, ShieldCheck, Store, Users } from "lucide-react";
import { PROJECT_STATUS_LABEL, DIFFICULTY_LABEL, listCategories, categoryBySlug } from "@werkraum/shared";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { MarketingHeader, MarketingFooter } from "@/components/landing/marketing-chrome";
import { CountUp, Marquee, MarqueeGroup, RevealObserver } from "@/components/landing/motion";
import { LinkButton } from "@/components/ui/button";
import { Cover } from "@/components/ui/media";
import { Glyph } from "@/components/ui/glyphs";
import { Avatar, Difficulty } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

export const metadata = { alternates: { canonical: "/" } };

export const revalidate = 300;

async function landingData() {
  try {
    // Nur Inhalte aktiver Konten – Projekte gebannter oder gelöschter Konten führen sonst ins Leere (404)
    const visible = { state: "PUBLISHED", visibility: "PUBLIC", owner: { status: "ACTIVE" } } as const;
    const [projects, tutorials, creators, catCounts, latest, communities] = await Promise.all([
      db.project.count({ where: visible }),
      db.tutorial.count({ where: { state: "PUBLISHED", author: { status: "ACTIVE" } } }),
      db.userProfile.count({ where: { projectCount: { gt: 0 }, user: { status: "ACTIVE" } } }),
      db.project.groupBy({ by: ["category"], where: visible, _count: true }),
      db.project.findMany({
        where: { ...visible, status: { not: "ARCHIVED" } },
        orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
        take: 12,
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
      db.community.findMany({
        where: { visibility: "PUBLIC", state: "PUBLISHED", owner: { status: "ACTIVE" } },
        orderBy: [{ isFeatured: "desc" }, { memberCount: "desc" }],
        take: 3,
        select: { id: true, slug: true, name: true, category: true, memberCount: true },
      }),
    ]);
    return { projects, tutorials, creators, catCounts: new Map(catCounts.map((c) => [c.category, c._count])), latest, communities };
  } catch {
    return { projects: 0, tutorials: 0, creators: 0, catCounts: new Map<string, number>(), latest: [], communities: [] };
  }
}

type LatestProject = Awaited<ReturnType<typeof landingData>>["latest"][number];

const ZAHLWORT = ["Null", "Eine", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Elf", "Zwölf", "Dreizehn", "Vierzehn", "Fünfzehn", "Sechzehn", "Siebzehn", "Achtzehn", "Neunzehn", "Zwanzig"];
/** „Fünfzehn Werkstätten“ – aus der Zahl aktiver Kategorien (Admins können Kategorien abschalten). */
function werkstaetten(n: number) {
  const word = ZAHLWORT[n] ?? String(n);
  return n === 1 ? `${word} Werkstatt` : `${word} Werkstätten`;
}

const tage = (n: number) => (n === 1 ? "einen Tag" : `${n} Tage`);

/** Einheitlicher Abschnittskopf: Kicker, Titel, kurzer Text. */
function SectionHead({ id, kicker, title, children, className, align = "left" }: { id?: string; kicker: string; title: string; children?: React.ReactNode; className?: string; align?: "left" | "center" }) {
  return (
    <div data-reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p className={cn("eyebrow", align === "center" && "justify-center")}>{kicker}</p>
      <h2 id={id} className="display mt-4 text-display">{title}</h2>
      {children && <p className="mt-4 text-body-lg text-ink-2">{children}</p>}
    </div>
  );
}

const projectHref = (p: LatestProject) => `/u/${p.owner.profile?.handle}/${p.slug}`;

/** Projektkarte im Laufband. */
function ShowcaseCard({ p }: { p: LatestProject }) {
  return (
    <Link href={projectHref(p)} className="zoom lift group block w-[232px] shrink-0 rounded-2xl border border-line bg-card p-2 sm:w-[260px]">
      <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="4/3" sizes="260px" className="rounded-[14px]" plateNumber={false} />
      <div className="px-1.5 pb-1.5 pt-3">
        <p className="flex items-center justify-between gap-2 text-[12px] text-muted">
          <span className="truncate">{categoryBySlug(p.category)?.short} · {PROJECT_STATUS_LABEL[p.status]}</span>
          <Difficulty level={p.difficulty} />
        </p>
        <h3 className="mt-1 truncate text-[15px] font-bold tracking-[-0.01em] text-ink">{p.title}</h3>
        <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? ""} size={20} />
          <span className="truncate">{p.owner.profile?.displayName}</span>
        </p>
      </div>
    </Link>
  );
}

/** Hero-Collage: drei echte Projekte als leicht gefächerter Stapel (nur ab lg). */
function HeroCollage({ items }: { items: LatestProject[] }) {
  const [a, b, c] = items;
  if (!a) return null;
  const card = (p: LatestProject, className: string, delay: string) => (
    <Link
      href={projectHref(p)}
      className={cn("zoom group absolute block w-[300px] rounded-[22px] border border-line bg-card p-2.5 shadow-md transition-[translate,rotate,box-shadow] duration-500 ease-[var(--ease-out-quint)] hover:z-20 hover:shadow-float focus-visible:z-20 animate-rise", className)}
      style={{ animationDelay: delay }}
    >
      <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="1/1" sizes="300px" className="rounded-[16px]" plateNumber={false} />
      <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-3">
        <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? ""} size={28} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold text-ink">{p.title}</span>
          <span className="block truncate text-[12px] text-muted">
            {p.owner.profile?.displayName} · {PROJECT_STATUS_LABEL[p.status]}
          </span>
        </span>
      </div>
    </Link>
  );
  return (
    <div className="relative hidden h-[560px] lg:block" aria-label="Aktuelle Projekte aus der Community" role="group">
      {b && card(b, "left-0 top-16 -rotate-6 hover:-rotate-3 hover:-translate-y-2", "120ms")}
      {c && card(c, "right-0 top-24 rotate-6 hover:rotate-3 hover:-translate-y-2", "200ms")}
      {card(a, "left-1/2 top-0 z-10 -translate-x-1/2 hover:-translate-y-2", "40ms")}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-md animate-rise" style={{ animationDelay: "360ms" }}>
        <span className="grid size-9 place-items-center rounded-full bg-pine-soft text-pine">
          <Check size={16} strokeWidth={2.6} aria-hidden />
        </span>
        <span className="text-[13px] leading-tight">
          <span className="block font-bold text-ink">{a._count.updates} Einträge im Projektjournal</span>
          <span className="block text-muted">{a.title}</span>
        </span>
      </div>
    </div>
  );
}

export default async function Landing() {
  if (await currentUser()) redirect("/feed");
  const d = await landingData();
  const [feeBps, holdDays] = await Promise.all([getSetting("commerce.feeBps").catch(() => 600), getSetting("commerce.payoutHoldDays").catch(() => 3)]);
  const fee = (Number(feeBps) / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const categories = listCategories({ activeOnly: true });

  const features = [
    {
      icon: Layers,
      title: "Projekte",
      href: "/projekte",
      cta: "Projekte ansehen",
      body: "Dokumentiere dein Projekt Schritt für Schritt im Journal – mit Fotos, Meilensteinen, Problemen und Lösungen.",
      demo: (
        <ol className="space-y-0 border-l-2 border-line pl-0">
          {[
            ["Tag 1", "Ton geknetet, Boden aufgebaut", "Meilenstein"],
            ["Tag 3", "Wülste bis zur Schulter – Riss am Rand", "Problem"],
            ["Tag 4", "Schlicker + Feuchttuch hat geholfen", "Lösung"],
          ].map(([day, text, tag], i) => (
            <li key={day} className="relative py-1.5 pl-5">
              <span className={cn("absolute -left-[6px] top-[13px] size-2.5 rounded-full ring-4 ring-card", i === 2 ? "bg-pine" : i === 1 ? "bg-moss" : "bg-ink")} />
              <span className="text-[11.5px] font-semibold text-muted">{day} · {tag}</span>
              <span className="block text-[14px] font-medium text-ink">{text}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      icon: BookOpen,
      title: "Anleitungen",
      href: "/anleitungen",
      cta: "Anleitungen ansehen",
      body: "Strukturierte Schritte, Materiallisten und klare Sicherheitshinweise. Hake Schritte ab und übernimm Material direkt in deine Einkaufsliste.",
      demo: (
        <ul className="space-y-1.5">
          {[
            ["Beine auf 45 cm ablängen", true],
            ["Zapfenlöcher bohren – Schutzbrille!", true],
            ["Sitzfläche verleimen", false],
          ].map(([t, done], i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2 text-[14px]">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", done ? "border-moss bg-moss text-paper" : "border-field bg-card")}>{done && <Check size={12} strokeWidth={3} />}</span>
              <span className={done ? "text-muted line-through decoration-1" : "font-medium text-ink"}>{t as string}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      icon: Users,
      title: "Communities",
      href: "/communities",
      cta: "Communities ansehen",
      body: "Gruppen rund um dein Handwerk: Fragen stellen, Fortschritte zeigen, bei Wettbewerben und Events mitmachen.",
      demo: (
        <ul className="space-y-1.5">
          {(d.communities.length
            ? d.communities.map((c) => ({ key: c.id, name: c.name, glyph: categoryBySlug(c.category)?.glyph ?? "spark", note: `${new Intl.NumberFormat("de-CH").format(c.memberCount)} Mitglieder` }))
            : categories.slice(0, 3).map((c) => ({ key: c.slug, name: c.name, glyph: c.glyph, note: "Community" }))
          ).map((c) => (
            <li key={c.key} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-moss-soft text-moss-ink">
                <Glyph name={c.glyph} size={18} strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{c.name}</span>
              <span className="shrink-0 text-[12px] text-muted">{c.note}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      icon: Store,
      title: "Marktplatz",
      href: "/markt",
      cta: "Marktplatz ansehen",
      body: "Einzelstücke, Kleinserien, Materialsets und Pläne – direkt von Makern. Viele zeigen das Projekt, aus dem ihr Stück entstanden ist.",
      demo: (
        <dl className="divide-y divide-line rounded-xl bg-paper px-3 text-[14px]">
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Shop eröffnen & einstellen</dt>
            <dd className="font-bold text-pine">kostenlos</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Provision pro Verkauf</dt>
            <dd className="font-bold text-ink num">{fee} %</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Gebühren für Käufer:innen</dt>
            <dd className="font-bold text-ink">keine</dd>
          </div>
        </dl>
      ),
    },
  ];

  const steps = [
    ["Konto erstellen", "Kostenlos registrieren und auswählen, was dich interessiert – Häkeln, Holz, Keramik oder alles zusammen."],
    ["Machen & festhalten", "Starte ein Projekt und halte fest, wie es wächst. Fortschritte teilst du mit einem Klick im Feed."],
    ["Teilen, lernen, verkaufen", "Aus Erfahrung wird eine Anleitung, aus Projekten entstehen Nachbauten – und wenn du magst, verkaufst du deine Stücke."],
  ];

  const trust = [
    {
      icon: Lock,
      title: "Sichere Zahlung über Stripe",
      body: "Bezahlt wird über unseren Zahlungsdienstleister Stripe – Kartendaten werden direkt dort verarbeitet, nicht bei Werkuno und nicht im Shop.",
    },
    {
      icon: Percent,
      title: `Transparente ${fee} % Provision`,
      body: `Einstellen ist kostenlos. Erst bei einem Verkauf fallen ${fee} % an – transparent vor jeder Transaktion, ohne versteckte Gebühren und ohne bezahlte Platzierungen.`,
    },
    {
      icon: ShieldCheck,
      title: "Haltefrist schützt Käufer:innen",
      body:
        holdDays > 0
          ? `Der Erlös wird erst ${tage(holdDays)} nach Abschluss einer Bestellung ausgezahlt. Reklamationen und Erstattungen lassen sich so direkt abwickeln.`
          : "Problemfälle und angefochtene Zahlungen bleiben zurückgehalten, bis sie geklärt sind. Reklamationen lassen sich so direkt abwickeln.",
    },
  ];

  const faq: [string, React.ReactNode][] = [
    [`Was kostet ${BRAND.name}?`, <>Nichts. Entdecken, Projekte dokumentieren, Anleitungen schreiben, bloggen und Communities sind kostenlos. Nur wenn du auf dem Marktplatz verkaufst, fällt pro Verkauf eine Provision von {fee} % an.</>],
    ["Brauche ich Erfahrung?", <>Nein. Ob {DIFFICULTY_LABEL[1]} oder Profi – du bist willkommen. Jede Anleitung zeigt ihre Schwierigkeit, und in den Communities helfen dir andere weiter.</>],
    ["Wem gehören meine Inhalte?", <>Dir. Du behältst die Rechte an deinen Fotos, Projekten und Anleitungen. Wer etwas nachbaut, nennt das Original – sichtbar. Mehr in den <Link href="/rechtliches/agb" className="font-semibold text-moss-ink underline underline-offset-2">Nutzungsbedingungen</Link>.</>],
    ["Wie funktioniert Verkaufen?", <>Du eröffnest in deinem Studio einen Shop, stellst Produkte ein und erhältst Zahlungen über Stripe. Alle Regeln, Gebühren und Auszahlungsfristen findest du in den <Link href="/richtlinien/marktplatz" className="font-semibold text-moss-ink underline underline-offset-2">Marktplatz-Richtlinien</Link>.</>],
    ["Was zeigt mir der Feed?", <>Der Feed mischt Frisches, deine Interessen und kleine Ateliers – nicht nur die Lautesten. Sortiert wird nach Frische, Relevanz und Vielfalt, und alles, was du speicherst, bleibt auffindbar.</>],
  ];

  return (
    // .landing: Designwerte „Werkbuch 2“ (globals.css) gelten nur auf der Startseite
    <div className="landing bg-paper">
      <MarketingHeader />
      <RevealObserver />
      <main id="main">
        {/* ── Hero ───────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 pb-14 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:pb-20 lg:pt-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card py-1 pl-1.5 pr-3 text-[12.5px] font-semibold text-ink-2 shadow-xs animate-rise">
                <span aria-hidden className="grid size-5 place-items-center rounded-full bg-moss-soft"><span className="size-1.5 rounded-full bg-moss" /></span>
                Das soziale Netzwerk für Selbstgemachtes
              </p>
              <h1 className="display mt-6 text-hero animate-rise [animation-delay:60ms]">
                Ein Faden.
                <br />
                <span className="text-moss">Unzählige</span> Projekte.
              </h1>
              <p className="mt-6 max-w-[34rem] text-body-lg text-ink-2 sm:text-[1.1875rem] sm:leading-[1.6] animate-rise [animation-delay:120ms]">
                {BRAND.name} verbindet Menschen, die mit ihren Händen erschaffen: Projekte dokumentieren, mit Anleitungen lernen, sich in Communities austauschen – und
                Handgemachtes auf dem Marktplatz kaufen und verkaufen.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-rise [animation-delay:180ms]">
                <LinkButton href="/registrieren" size="lg" className="group/cta">
                  Kostenlos starten <ArrowRight size={16} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </LinkButton>
                <LinkButton href="/entdecken" size="lg" variant="secondary">
                  Entdecken
                </LinkButton>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-muted animate-rise [animation-delay:240ms]">
                {["Kostenlos", "Gemacht in der Schweiz", "Deine Inhalte bleiben deine"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check size={14} strokeWidth={2.6} className="text-pine" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
                {(
                  [
                    ["Projekte", d.projects],
                    ["Anleitungen", d.tutorials],
                    ["Creator", d.creators],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="flex flex-col-reverse">
                    <dt className="mt-1 text-[13px] font-medium text-muted">{l}</dt>
                    <dd className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-ink">
                      <CountUp value={v} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <HeroCollage items={d.latest.slice(0, 3)} />
          </div>
        </section>

        {/* ── Live-Showcase ─────────────────────────────── */}
        <section className="border-y border-line bg-sunken/60 py-16 sm:py-20" aria-labelledby="showcase-title">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-6 px-5 sm:px-8">
            <div data-reveal className="max-w-2xl">
              <p className="eyebrow">Live aus der Community</p>
              <h2 id="showcase-title" className="display mt-4 text-display">Frisch von der Werkbank.</h2>
              <p className="mt-4 text-body-lg text-ink-2">Qualität vor Lautstärke: Hier zeigen Menschen, woran sie gerade arbeiten – vom ersten Skizzenstrich bis zum fertigen Stück.</p>
            </div>
            <LinkButton href="/projekte" variant="secondary">
              Alle Projekte <ArrowRight size={15} />
            </LinkButton>
          </div>
          {d.latest.length > 0 ? (
            <MarqueeGroup label="Projekte und Kategorien" className="mt-8">
              <Marquee label="Aktuelle Projekte" duration={Math.max(40, d.latest.length * 6)}>
                {d.latest.map((p) => (
                  <ShowcaseCard key={p.id} p={p} />
                ))}
              </Marquee>
              <div className="mx-auto mt-8 max-w-[1240px] px-5 sm:px-8">
                <h3 className="text-title font-bold">{werkstaetten(categories.length)} unter einem Dach</h3>
              </div>
              <Marquee label="Kategorien" duration={Math.max(36, categories.length * 3)} reverse>
                {categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/entdecken?kategorie=${c.slug}`}
                    className="group flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-line-strong bg-card pl-2 pr-4 text-[14px] font-semibold text-ink shadow-xs transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-moss"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-moss-soft text-moss-ink transition-transform duration-300 group-hover:-rotate-12">
                      <Glyph name={c.glyph} size={18} strokeWidth={1.7} />
                    </span>
                    {c.name}
                    <span className="num text-[12px] font-semibold text-muted">{d.catCounts.get(c.slug) ?? 0}</span>
                  </Link>
                ))}
              </Marquee>
            </MarqueeGroup>
          ) : (
            <p className="mx-auto mt-10 max-w-[1240px] px-5 text-muted sm:px-8">Die ersten Projekte entstehen gerade.</p>
          )}
        </section>

        {/* ── Was du hier machen kannst ─────────────────── */}
        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="features-title">
          <div data-reveal className="max-w-2xl">
            <p className="eyebrow">Alles an einem Ort</p>
            <h2 id="features-title" className="display mt-4 text-display">Entdecken. Erschaffen. Teilen.</h2>
            <p className="mt-4 text-body-lg text-ink-2">Ein Konto für alles – vom ersten Projekt bis zum eigenen Shop.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {features.map((f, i) => (
              <div key={f.title} data-reveal style={{ ["--reveal-i" as string]: i % 2 }}>
              <article className="lift group relative flex h-full flex-col rounded-3xl border border-line bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-moss-soft text-moss-ink">
                    <f.icon size={20} strokeWidth={1.9} aria-hidden />
                  </span>
                  <h3 className="text-headline font-bold">{f.title}</h3>
                </div>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                <div className="mt-6 flex-1">{f.demo}</div>
                <Link href={f.href} className="mt-6 inline-flex items-center gap-1.5 self-start text-[14px] font-bold text-moss-ink after:absolute after:inset-0 after:rounded-3xl">
                  {f.cta}
                  <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                </Link>
              </article>
              </div>
            ))}
          </div>
        </section>

        {/* ── So funktioniert's ─────────────────────────── */}
        <section className="border-y border-line bg-card" aria-labelledby="steps-title">
          <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
            <SectionHead id="steps-title" kicker="So funktioniert's" title="In drei Schritten an der Werkbank." align="center" />
            <div data-reveal className="relative mt-14">
              {/* Der Faden verbindet die Schritte (ab md) */}
              <svg aria-hidden className="absolute left-[16.67%] top-0 hidden h-12 w-[66.66%] text-rule-strong md:block" viewBox="0 0 680 48" preserveAspectRatio="none" fill="none">
                <path
                  className="draw-on-reveal"
                  pathLength={1}
                  d="M0 24 C 80 -4, 150 52, 230 24 S 380 -4, 450 24 S 600 52, 680 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
                {steps.map(([t, b], i) => (
                  <li key={t} className="flex flex-col items-center text-center">
                    <span className="grid size-12 place-items-center rounded-full border-2 border-moss bg-card text-[17px] font-extrabold text-moss-ink shadow-sm">{i + 1}</span>
                    <h3 className="mt-5 text-title font-bold">{t}</h3>
                    <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">{b}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div data-reveal className="mt-12 flex justify-center">
              <LinkButton href="/registrieren" size="lg">
                Kostenlos starten <ArrowRight size={16} />
              </LinkButton>
            </div>
          </div>
        </section>

        {/* ── Vertrauen im Marktplatz ───────────────────── */}
        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="trust-title">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div data-reveal>
              <p className="eyebrow">Marktplatz mit Vertrauen</p>
              <h2 id="trust-title" className="display mt-4 text-display">Fair kaufen und verkaufen.</h2>
              <p className="mt-4 max-w-md text-body-lg text-ink-2">
                Der Shop ergänzt die Community – er dominiert sie nie. Klare Regeln schützen Käufer:innen wie Verkäufer:innen.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/markt" variant="secondary">
                  Zum Marktplatz <ArrowRight size={15} />
                </LinkButton>
                <LinkButton href="/richtlinien/marktplatz" variant="ghost">
                  Marktplatz-Richtlinien
                </LinkButton>
              </div>
            </div>
            <ul className="grid gap-4">
              {trust.map((t, i) => (
                <li key={t.title} data-reveal style={{ ["--reveal-i" as string]: i }} className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-6 sm:flex-row sm:gap-5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pine-soft text-pine">
                    <t.icon size={22} strokeWidth={1.9} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-title font-bold">{t.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────── */}
        <section className="border-t border-line" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-28">
            <div data-reveal>
              <p className="eyebrow">Fragen & Antworten</p>
              <h2 id="faq-title" className="display mt-4 text-display">Kurz erklärt.</h2>
              <p className="mt-4 max-w-sm text-body-lg text-ink-2">
                Noch etwas offen? In der{" "}
                <Link href="/hilfe" className="font-semibold text-moss-ink underline underline-offset-4">
                  Hilfe
                </Link>{" "}
                findest du mehr.
              </p>
            </div>
            <div data-reveal className="divide-y divide-line border-y border-line">
              {faq.map(([q, a]) => (
                <details key={q} className="group/faq">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16.5px] font-bold text-ink transition-colors hover:text-moss-ink [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-card transition-transform duration-300 group-open/faq:rotate-180">
                      <ChevronDown size={16} aria-hidden />
                    </span>
                  </summary>
                  <div className="-mt-1 pb-6 pr-12 text-[15.5px] leading-relaxed text-ink-2">{a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Abschluss-CTA ─────────────────────────────── */}
        <section className="px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-ink text-paper">
            <svg aria-hidden className="absolute bottom-0 right-6 hidden h-[85%] w-1/2 text-moss/70 md:block" viewBox="0 0 400 300" fill="none" preserveAspectRatio="xMaxYMax meet">
              <path d="M10 280 C 90 280, 100 200, 160 200 S 240 280, 270 230 S 240 120, 310 110 S 410 170, 370 220" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="370" cy="220" r="5" fill="currentColor" />
            </svg>
            <div data-reveal className="relative px-6 py-16 sm:px-12 sm:py-20 lg:px-20 lg:py-24">
              <h2 className="display max-w-3xl text-display text-paper">
                Was entsteht als Nächstes <span className="text-clay-soft">auf deiner Werkbank?</span>
              </h2>
              <p className="mt-5 max-w-lg text-body-lg text-paper/80">
                Ein Konto für alles: entdecken, dokumentieren, Anleitungen schreiben, bloggen – und wenn du magst, verkaufen. {DIFFICULTY_LABEL[1]} oder Profi: Du bist willkommen.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <LinkButton href="/registrieren" size="lg" className="border-paper bg-paper text-ink hover:border-moss-soft hover:bg-moss-soft">
                  Kostenlos starten <ArrowRight size={16} />
                </LinkButton>
                <Link href="/entdecken" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-semibold text-paper transition-colors hover:bg-paper/10">
                  Zuerst stöbern <ArrowUpRight size={16} aria-hidden />
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
