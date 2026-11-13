import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, Banknote, BookOpen, Check, ChevronDown, CreditCard, Flag, Hourglass, Layers, NotebookPen, PackageCheck, Percent, Share2, ShieldCheck, Store, Truck, UserPlus, Users } from "lucide-react";
import { PROJECT_STATUS_LABEL, DIFFICULTY_LABEL, listCategories, categoryBySlug, computeFees, formatMoney } from "@werkraum/shared";
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
import { features as features_ } from "@/server/env";
import { MobileWelcome } from "@/components/landing/mobile-welcome";

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
          <span className="block font-bold text-ink">{a._count.updates ? `${a._count.updates} ${a._count.updates === 1 ? "Eintrag" : "Einträge"} im Projektjournal` : "Projektidee zum Nachbauen"}</span>
          <span className="block text-muted">{a.title}</span>
        </span>
      </div>
    </div>
  );
}

/** Mobil, unter dem Willkommensbildschirm: „Neu in der Werkstatt“ wie der Gastzugang der App. */
function MobileLatest({ items }: { items: LatestProject[] }) {
  return (
    <section id="neu" aria-labelledby="neu-titel" className="scroll-mt-4 border-t border-line bg-paper px-5 pb-12 pt-10 md:hidden">
      <p className="spec text-moss">{BRAND.name} · Gastzugang</p>
      <h2 className="display mt-2 text-[36px] leading-[1.05]">Sieh dich um.</h2>
      <p className="mt-2.5 text-[15px] leading-relaxed text-muted">Projekte, Anleitungen und Menschen, die mit den Händen arbeiten. Mit einem Konto kannst du folgen, speichern und selbst dokumentieren.</p>
      <Link href="/registrieren" className="mt-5 flex h-[50px] w-full items-center justify-center rounded-full bg-moss text-[16px] font-semibold text-paper active:scale-[0.98]">
        Anmelden oder registrieren
      </Link>
      <h3 id="neu-titel" className="mt-10 flex items-baseline gap-3 border-b border-line pb-2">
        <span className="spec text-muted">01</span>
        <span className="text-[19px] font-bold tracking-[-0.01em]">Neu in der Werkstatt</span>
      </h3>
      {items.length ? (
        <ul className="mt-4 space-y-4">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={projectHref(p)} className="block overflow-hidden rounded-[20px] border border-line bg-card active:scale-[0.99]">
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? ""} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{p.owner.profile?.displayName}</span>
                    <span className="block truncate text-[12px] text-muted">{categoryBySlug(p.category)?.short} · {PROJECT_STATUS_LABEL[p.status]}</span>
                  </span>
                </div>
                <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="4/3" sizes="100vw" plateNumber={false} />
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <span className="min-w-0 truncate text-[16px] font-bold tracking-[-0.01em] text-ink">{p.title}</span>
                  <Difficulty level={p.difficulty} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">Bald findest du hier die neuesten Projekte aus der Community.</p>
      )}
      <Link href="/entdecken" className="mt-6 flex h-[48px] w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-card text-[15px] font-semibold text-ink active:scale-[0.98]">
        Alles entdecken <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}

export default async function Landing() {
  if (await currentUser()) redirect("/feed");
  const d = await landingData();
  const [feeBps, holdDays, autoCompleteDays] = await Promise.all([
    getSetting("commerce.feeBps").catch(() => 600),
    getSetting("commerce.payoutHoldDays").catch(() => 3),
    getSetting("commerce.autoCompleteDays").catch(() => 14),
  ]);
  // Rechenbeispiel mit derselben Gebührenlogik wie der Checkout (Provision nur auf den Warenwert)
  const example = computeFees(4000, 700, Number(feeBps));
  const chf = (minor: number) => formatMoney(minor, "CHF");
  const fee = (Number(feeBps) / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const categories = listCategories({ activeOnly: true });

  // Mini-Vorschauen der App in den Kacheln – echt wirkende Oberflächen statt Symbolbilder
  const Window = ({ label, chip, children }: { label: string; chip?: React.ReactNode; children: React.ReactNode }) => (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-card/70 px-4 py-2.5">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </span>
        <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <span className="shrink-0">{chip}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
  const Chip = ({ tone = "neutral", children }: { tone?: "neutral" | "moss" | "pine"; children: React.ReactNode }) => (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold", tone === "moss" ? "bg-moss-soft text-moss-ink" : tone === "pine" ? "bg-pine-soft text-pine" : "bg-sunken text-ink-2")}>{children}</span>
  );
  const Progress = ({ value, tone = "moss" }: { value: number; tone?: "moss" | "pine" }) => (
    <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
      <span className={cn("block h-full rounded-full", tone === "pine" ? "bg-pine" : "bg-moss")} style={{ width: `${value}%` }} />
    </span>
  );

  const features = [
    {
      icon: Layers,
      title: "Projekte",
      href: "/projekte",
      cta: "Projekte ansehen",
      span: "lg:col-span-7",
      body: "Dokumentiere dein Projekt Schritt für Schritt im Journal – mit Fotos, Meilensteinen, Problemen und Lösungen. Andere sehen, wie es entsteht, und bauen es nach.",
      points: ["Projektjournal mit Zeitstrahl", "Material- und Werkzeuglisten", "Nachbauten verlinken das Original"],
      demo: (
        <Window label="Projektjournal" chip={<Chip tone="moss">In Bearbeitung</Chip>}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">Steinzeug-Vase, gedreht</p>
              <p className="text-[12px] text-muted">Keramik · Mittel · 4 Einträge</p>
            </div>
            <span className="num shrink-0 text-[13px] font-bold text-ink">60 %</span>
          </div>
          <div className="mt-2.5"><Progress value={60} /></div>
          <ol className="mt-4 space-y-0 border-l-2 border-line">
            {[
              ["Tag 1", "Ton geknetet, Boden aufgebaut", "Meilenstein", "bg-ink"],
              ["Tag 3", "Wülste bis zur Schulter – Riss am Rand", "Problem", "bg-moss"],
              ["Tag 4", "Schlicker + Feuchttuch hat geholfen", "Lösung", "bg-pine"],
            ].map(([day, text, tag, dot]) => (
              <li key={day} className="relative py-1.5 pl-5">
                <span className={cn("absolute -left-[6px] top-[13px] size-2.5 rounded-full ring-4 ring-paper", dot)} />
                <span className="text-[11.5px] font-semibold text-muted">{day} · {tag}</span>
                <span className="block text-[14px] font-medium text-ink">{text}</span>
              </li>
            ))}
          </ol>
        </Window>
      ),
    },
    {
      icon: BookOpen,
      title: "Anleitungen",
      href: "/anleitungen",
      cta: "Anleitungen ansehen",
      span: "lg:col-span-5",
      body: "Strukturierte Schritte, Materiallisten und klare Sicherheitshinweise. Hake Schritte ab und übernimm Material direkt in deine Einkaufsliste.",
      points: ["Schritte zum Abhaken", "Material in die Einkaufsliste"],
      demo: (
        <Window label="Hocker aus Eiche" chip={<Chip>2 / 3</Chip>}>
          <Progress value={66} tone="pine" />
          <ul className="mt-3 space-y-1.5">
            {[
              ["Beine auf 45 cm ablängen", true],
              ["Zapfenlöcher bohren – Schutzbrille!", true],
              ["Sitzfläche verleimen", false],
            ].map(([t, done], i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 text-[14px]">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", done ? "border-pine bg-pine text-paper" : "border-field bg-card")}>{done && <Check size={12} strokeWidth={3} />}</span>
                <span className={done ? "text-muted line-through decoration-1" : "font-medium text-ink"}>{t as string}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-pine-soft px-3 py-2.5">
            <span className="text-[13px] font-semibold text-pine">4 Materialien · Eichenkantel, Holzleim …</span>
            <span className="shrink-0 rounded-full bg-pine px-2.5 py-1 text-[11.5px] font-bold text-paper">+ Einkaufsliste</span>
          </div>
        </Window>
      ),
    },
    {
      icon: Users,
      title: "Communities",
      href: "/communities",
      cta: "Communities ansehen",
      span: "lg:col-span-5",
      body: "Gruppen rund um dein Handwerk: Fragen stellen, Fortschritte zeigen, bei Wettbewerben und Events mitmachen.",
      points: ["Fragen, Treffen, Wettbewerbe"],
      demo: (
        <Window label="Communities" chip={<Chip tone="pine">Offen</Chip>}>
          <ul className="space-y-1.5">
            {(d.communities.length
              ? d.communities.map((c) => ({ key: c.id, name: c.name, glyph: categoryBySlug(c.category)?.glyph ?? "spark", note: `${new Intl.NumberFormat("de-CH").format(c.memberCount)} Mitglieder` }))
              : categories.slice(0, 3).map((c) => ({ key: c.slug, name: c.name, glyph: c.glyph, note: "Beitreten" }))
            ).map((c) => (
              <li key={c.key} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-moss-soft text-moss-ink">
                  <Glyph name={c.glyph} size={18} strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{c.name}</span>
                <span className="shrink-0 text-[12px] font-medium text-muted">{c.note}</span>
              </li>
            ))}
          </ul>
        </Window>
      ),
    },
    {
      icon: Store,
      title: "Marktplatz",
      href: "/markt",
      cta: "Marktplatz ansehen",
      span: "lg:col-span-7",
      body: "Einzelstücke, Kleinserien, Materialsets und Pläne – direkt von Makern. Viele zeigen das Projekt, aus dem ihr Stück entstanden ist.",
      points: ["Sichere Zahlung über Stripe", "Faire, transparente Gebühren"],
      demo: (
        <Window label="Dein Shop" chip={<Chip tone="pine">Kostenlos</Chip>}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-2.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-sunken text-moss-ink">
                <Glyph name="vessel" size={24} strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-ink">Tasse, Steinzeug</span>
                <span className="num block text-[13px] font-semibold text-ink-2">CHF 38.–</span>
                <span className="mt-0.5 inline-block text-[11px] font-semibold text-moss-ink">Aus einem Projekt</span>
              </span>
            </div>
            <dl className="divide-y divide-line rounded-xl border border-line bg-card px-3 text-[13.5px]">
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Shop eröffnen</dt>
                <dd className="font-bold text-pine">kostenlos</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Provision</dt>
                <dd className="num font-bold text-ink">{fee} %</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Für Käufer:innen</dt>
                <dd className="font-bold text-ink">keine Gebühr</dd>
              </div>
            </dl>
          </div>
          <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-[11.5px] font-semibold">
            {[
              ["Bezahlt", "bg-pine text-paper"],
              ["Versendet", "bg-pine text-paper"],
              [`Auszahlung nach ${Number(holdDays) === 1 ? "1 Tag" : `${holdDays} Tagen`}`, "border border-line bg-card text-ink-2"],
            ].map(([label, cls]) => (
              <li key={label} className={cn("rounded-lg px-2 py-1.5", cls)}>{label}</li>
            ))}
          </ol>
        </Window>
      ),
    },
  ];

  const steps = [
    { icon: UserPlus, title: "Konto erstellen", body: "Kostenlos registrieren und auswählen, was dich interessiert – Häkeln, Holz, Keramik oder alles zusammen.", meta: "In 1 Minute" },
    { icon: NotebookPen, title: "Machen & festhalten", body: "Starte ein Projekt und halte fest, wie es wächst. Fortschritte teilst du mit einem Klick im Feed.", meta: "Journal mit Fotos" },
    { icon: Share2, title: "Teilen, lernen, verkaufen", body: "Aus Erfahrung wird eine Anleitung, aus Projekten entstehen Nachbauten – und wenn du magst, verkaufst du deine Stücke.", meta: "Anleitung · Shop" },
  ];

  // Ergänzt Ablauf und Rechenbeispiel (Stripe, Provision, Haltefrist stehen dort schon)
  const trust = [
    { icon: ShieldCheck, title: "Geprüfte Shops", body: "Wer verkauft, verifiziert sich bei Stripe mit Identität und Bankkonto, bevor Zahlungen möglich sind." },
    { icon: Layers, title: "Herkunft sichtbar", body: "Viele Stücke verlinken das Projekt, aus dem sie entstanden sind – du siehst, wie es gemacht wurde." },
    { icon: Flag, title: "Melden & Moderation", body: "Fragwürdige Angebote kannst du melden. Unser Team prüft sie und greift bei Verstössen ein." },
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
      {/* Mobil: Willkommensbildschirm wie in der iOS-App statt der langen Startseite */}
      <div className="hidden md:block">
        <MarketingHeader />
      </div>
      <RevealObserver />
      <main id="main">
        <MobileWelcome apple={features_.apple()} pinterest={features_.pinterest()} />
        <MobileLatest items={d.latest.slice(0, 6)} />
        <div className="hidden md:block">
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
          <div data-reveal className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">Alles an einem Ort</p>
              <h2 id="features-title" className="display mt-4 text-display">Entdecken. Erschaffen. Teilen.</h2>
            </div>
            <div>
              <p className="text-body-lg text-ink-2">Ein Konto für alles – vom ersten Projekt bis zum eigenen Shop. Alles greift ineinander: Projekte werden zu Anleitungen, Anleitungen zu Nachbauten, Nachbauten zu Stücken im Marktplatz.</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {features.map((f) => (
                  <li key={f.title}>
                    <a href={`#feature-${f.title.toLowerCase()}`} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-moss hover:text-moss-ink">
                      <f.icon size={14} strokeWidth={2} aria-hidden /> {f.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:gap-5">
            {features.map((f, i) => (
              <div key={f.title} id={`feature-${f.title.toLowerCase()}`} data-reveal className={cn("scroll-mt-24", f.span)} style={{ ["--reveal-i" as string]: i % 2 }}>
                <article className="lift group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-card p-6 sm:p-8">
                  {/* feiner Farbverlauf oben – ruhige Tiefe statt flacher Fläche */}
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,var(--color-moss-soft),transparent)] opacity-50" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <span className="grid size-12 place-items-center rounded-2xl bg-ink text-paper shadow-sm">
                        <f.icon size={21} strokeWidth={1.8} aria-hidden />
                      </span>
                      <div>
                        <p className="spec text-muted">{String(i + 1).padStart(2, "0")}</p>
                        <h3 className="text-headline font-bold leading-tight">{f.title}</h3>
                      </div>
                    </div>
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition-colors duration-200 group-hover:border-moss group-hover:bg-moss group-hover:text-paper">
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <p className="relative mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                  <ul className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {f.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                        <Check size={14} strokeWidth={2.6} className="text-pine" aria-hidden /> {pt}
                      </li>
                    ))}
                  </ul>
                  <div className="relative mt-6 flex-1">{f.demo}</div>
                  <Link href={f.href} className="mt-6 inline-flex items-center gap-1.5 self-start text-[14px] font-bold text-moss-ink after:absolute after:inset-0 after:z-10 after:rounded-[28px]">
                    {f.cta}
                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                  </Link>
                </article>
              </div>
            ))}
          </div>
        </section>

        {/* ── So funktioniert's ─────────────────────────── */}
        <section className="relative overflow-hidden bg-ink text-paper" aria-labelledby="steps-title">
          {/* Punktraster wie in der App, sehr dezent */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-moss opacity-20 blur-[120px]" />
          <div className="relative mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
            <div data-reveal className="mx-auto max-w-2xl text-center">
              <p className="eyebrow justify-center text-[#f0a493]">So funktioniert&apos;s</p>
              <h2 id="steps-title" className="display mt-4 text-display text-paper">In drei Schritten an der Werkbank.</h2>
              <p className="mt-4 text-body-lg text-paper/70">Kein Abo, keine Kreditkarte. Du entscheidest, was du teilst – und wann.</p>
            </div>
            <div data-reveal className="relative mt-14">
              {/* Der Faden verbindet die Schritte (ab md) */}
              <svg aria-hidden className="absolute left-[16.67%] top-[38px] hidden h-12 w-[66.66%] text-[#f0a493]/50 md:block" viewBox="0 0 680 48" preserveAspectRatio="none" fill="none">
                <path className="draw-on-reveal" pathLength={1} d="M0 24 C 80 -4, 150 52, 230 24 S 380 -4, 450 24 S 600 52, 680 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 0" />
              </svg>
              <ol className="relative grid gap-5 md:grid-cols-3 md:gap-6">
                {steps.map((st, i) => (
                  <li key={st.title} className="group relative flex flex-col rounded-[24px] border border-white/10 bg-[#2d2b2e] p-6 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] transition-colors duration-300 hover:border-white/20 hover:bg-[#333134] sm:p-7">
                    <div className="flex items-center justify-between">
                      <span className="relative grid size-[52px] place-items-center rounded-2xl bg-moss text-paper shadow-[0_10px_30px_-10px_rgba(182,75,58,0.8)]">
                        <st.icon size={22} strokeWidth={1.9} aria-hidden />
                      </span>
                      <span className="display text-[56px] leading-none text-white/[0.09]" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <p className="spec mt-6 text-[#f0a493]">Schritt {i + 1}</p>
                    <h3 className="mt-1.5 text-title font-bold text-paper">{st.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-paper/70">{st.body}</p>
                    <p className="mt-5 inline-flex items-center gap-1.5 self-start rounded-full border border-white/15 px-2.5 py-1 text-[12px] font-semibold text-paper/80">
                      <Check size={12} strokeWidth={3} aria-hidden /> {st.meta}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
            <div data-reveal className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/registrieren" className="inline-flex h-12 items-center gap-2 rounded-full bg-paper px-7 text-[15px] font-bold text-ink transition-transform duration-200 hover:-translate-y-0.5">
                Kostenlos starten <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/entdecken" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 px-7 text-[15px] font-semibold text-paper transition-colors hover:bg-white/10">
                Erst einmal umsehen
              </Link>
            </div>
          </div>
        </section>

        {/* ── Vertrauen im Marktplatz ───────────────────── */}
        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="trust-title">
          <div data-reveal className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">Marktplatz mit Vertrauen</p>
              <h2 id="trust-title" className="display mt-4 text-display">Fair kaufen und verkaufen.</h2>
            </div>
            <div>
              <p className="text-body-lg text-ink-2">Der Shop ergänzt die Community – er dominiert sie nie. Klare Regeln schützen Käufer:innen wie Verkäufer:innen, und jede Gebühr steht vorher fest.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <LinkButton href="/markt" variant="secondary">
                  Zum Marktplatz <ArrowRight size={15} />
                </LinkButton>
                <LinkButton href="/richtlinien/marktplatz" variant="ghost">
                  Marktplatz-Richtlinien
                </LinkButton>
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:gap-5">
            {/* Bestellablauf – genau so, wie der Marktplatz abrechnet */}
            <article data-reveal className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 sm:p-8 lg:col-span-7">
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,var(--color-pine-soft),transparent)] opacity-70" />
              <div className="relative flex items-center justify-between gap-4">
                <h3 className="text-headline font-bold leading-tight">So läuft eine Bestellung</h3>
                <span className="rounded-full bg-pine-soft px-2.5 py-1 text-[12px] font-bold text-pine">{holdDays > 0 ? "Auszahlung erst nach der Haltefrist" : "Auszahlung erst nach Abschluss"}</span>
              </div>
              <ol className="relative mt-7">
                {[
                  { icon: CreditCard, title: "Bezahlt", body: "Über Stripe – Kartendaten sehen weder Werkuno noch der Shop." },
                  { icon: Truck, title: "Versendet", body: "Der Shop versendet und hinterlegt die Sendungsnummer." },
                  { icon: PackageCheck, title: "Erhalten", body: `Käufer:in bestätigt den Erhalt – sonst gilt die Bestellung ${autoCompleteDays} Tage nach dem Versand als abgeschlossen.` },
                  {
                    icon: Hourglass,
                    title: holdDays > 0 ? `${holdDays} ${Number(holdDays) === 1 ? "Tag" : "Tage"} Haltefrist` : "Klärung offener Fälle",
                    body: holdDays > 0 ? "Zeit für Reklamationen und Erstattungen, bevor das Geld weitergeht." : "Reklamationen und Erstattungen werden geklärt, bevor das Geld weitergeht.",
                  },
                  { icon: Banknote, title: "Ausgezahlt", body: "Der Erlös geht auf das Bankkonto des Shops." },
                ].map((st, i, all) => (
                  <li key={st.title} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < all.length - 1 && <span aria-hidden className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-line-strong" />}
                    <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-xl border", i === all.length - 1 ? "border-pine bg-pine text-paper" : "border-line bg-paper text-ink-2")}>
                      <st.icon size={18} strokeWidth={1.9} aria-hidden />
                    </span>
                    <div className="pt-1">
                      <p className="text-[15px] font-bold text-ink">
                        <span className="spec mr-2 text-muted">{String(i + 1).padStart(2, "0")}</span>
                        {st.title}
                      </p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{st.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>

            {/* Rechenbeispiel aus der echten Gebührenlogik */}
            <article data-reveal style={{ ["--reveal-i" as string]: 1 }} className="relative flex flex-col overflow-hidden rounded-[28px] border border-line bg-card p-6 sm:p-8 lg:col-span-5">
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,var(--color-moss-soft),transparent)] opacity-50" />
              <div className="relative flex items-center justify-between gap-4">
                <h3 className="text-headline font-bold leading-tight">Rechenbeispiel</h3>
                <Percent size={20} strokeWidth={1.9} className="text-moss-ink" aria-hidden />
              </div>
              <p className="relative mt-2 text-[14px] text-muted">Ein Stück für {chf(example.subtotal)} mit {chf(example.shipping)} Versand:</p>
              <dl className="relative mt-5 overflow-hidden rounded-2xl border border-line bg-paper text-[14.5px]">
                <div className="flex items-center justify-between px-4 py-3">
                  <dt className="text-ink-2">Käufer:in bezahlt</dt>
                  <dd className="num font-semibold text-ink">{chf(example.total)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-line px-4 py-3">
                  <dt className="text-ink-2">Provision {fee} % (nur auf den Warenwert)</dt>
                  <dd className="num font-semibold text-moss-ink">− {chf(example.platformFee)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-line bg-card px-4 py-3.5">
                  <dt className="font-bold text-ink">Auszahlung an den Shop</dt>
                  <dd className="num text-[18px] font-extrabold tracking-[-0.01em] text-pine">{chf(example.sellerNet)}</dd>
                </div>
              </dl>
              <ul className="relative mt-5 space-y-2 text-[14px] text-ink-2">
                {["Shop eröffnen und einstellen: kostenlos", "Keine Gebühren für Käufer:innen", "Keine bezahlten Platzierungen"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check size={15} strokeWidth={2.6} className="shrink-0 text-pine" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </article>

            {/* Drei Zusagen, kompakt */}
            <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-12 lg:gap-5">
              {trust.map((t, i) => (
                <li key={t.title} data-reveal style={{ ["--reveal-i" as string]: i }} className="flex gap-4 rounded-[22px] border border-line bg-card p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-paper">
                    <t.icon size={18} strokeWidth={1.9} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold leading-snug">{t.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{t.body}</p>
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
        <section className="mx-auto max-w-[1240px] px-5 pb-20 sm:px-8 lg:pb-28" aria-labelledby="cta-title">
          <div data-reveal className="relative overflow-hidden rounded-[32px] border border-line bg-card">
            {/* derselbe ruhige Verlauf wie bei „Alles an einem Ort“ */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,var(--color-moss-soft),transparent)] opacity-60" />
            <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:p-14">
              <div className="flex flex-col">
                <p className="eyebrow">Jetzt mitmachen</p>
                <h2 id="cta-title" className="display mt-4 text-display">
                  Was entsteht als Nächstes <span className="text-moss">auf deiner Werkbank?</span>
                </h2>
                <p className="mt-5 max-w-lg text-body-lg text-ink-2">
                  Ein Konto für alles: entdecken, dokumentieren, Anleitungen schreiben, bloggen – und wenn du magst, verkaufen. {DIFFICULTY_LABEL[1]} oder Profi: Du bist willkommen.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LinkButton href="/registrieren" size="lg">
                    Kostenlos starten <ArrowRight size={16} />
                  </LinkButton>
                  <LinkButton href="/entdecken" size="lg" variant="outline">
                    Zuerst stöbern
                  </LinkButton>
                </div>
                <ul className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-8 text-[13.5px] font-medium text-ink-2">
                  {["Kostenlos, ohne Abo", "Ab 18 Jahren", "Deine Inhalte bleiben deine"].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Check size={15} strokeWidth={2.6} className="text-pine" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Rechts: was gerade tatsächlich auf Werkuno entsteht */}
              <div className="rounded-[24px] border border-line bg-paper p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="text-[13px] font-bold text-ink">Gerade auf der Werkbank</p>
                  <Link href="/projekte" className="text-[12.5px] font-semibold text-muted hover:text-ink">
                    Alle Projekte →
                  </Link>
                </div>
                {d.latest.length ? (
                  <ul className="mt-3 space-y-2">
                    {d.latest.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <Link href={projectHref(p)} className="group flex items-center gap-3.5 rounded-2xl border border-line bg-card p-2.5 pr-4 transition-colors hover:border-rule-strong">
                          <span className="block w-[72px] shrink-0 overflow-hidden rounded-xl">
                            <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="1/1" sizes="72px" plateNumber={false} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-bold text-ink group-hover:underline">{p.title}</span>
                            <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                              {categoryBySlug(p.category)?.short} · {PROJECT_STATUS_LABEL[p.status]} · {p.owner.profile?.displayName}
                            </span>
                          </span>
                          <Difficulty level={p.difficulty} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {categories.slice(0, 8).map((c) => (
                      <li key={c.slug}>
                        <Link href={`/entdecken?kategorie=${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-rule-strong">
                          <Glyph name={c.glyph} size={15} strokeWidth={1.8} /> {c.short}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 grid auto-cols-fr grid-flow-col divide-x divide-line rounded-2xl border border-line bg-card text-center">
                  {/* Nur Kennzahlen mit Inhalt – „0 Anleitungen“ wirbt nicht */}
                  {(
                    [
                      [d.projects, d.projects === 1 ? "Projekt" : "Projekte"],
                      [d.tutorials, d.tutorials === 1 ? "Anleitung" : "Anleitungen"],
                      [d.creators, d.creators === 1 ? "Creator" : "Creators"],
                      [categories.length, "Werkstätten"],
                    ] as [number, string][]
                  )
                    .filter(([n]) => n > 0)
                    .slice(0, 3)
                    .map(([n, label]) => (
                    <div key={label} className="px-2 py-3">
                      <p className="num text-[20px] font-extrabold tracking-[-0.02em] text-ink">{new Intl.NumberFormat("de-CH").format(n)}</p>
                      <p className="text-[12px] text-muted">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
