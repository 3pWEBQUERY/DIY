import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link2, MapPin, MessageSquare, Star, Store } from "lucide-react";
import { categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMediaKit } from "@/server/pro/profile";
import { ProjectCard } from "@/components/projects/project-card";
import { ShareButton } from "@/components/social/actions";
import { ProMark } from "@/components/pro/pro-mark";
import { PrintButton } from "@/components/pro/print-button";
import { Avatar, Notice } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { compactNumber, formatDate } from "@/lib/utils";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const kit = await getMediaKit(handle, null);
  if (!kit) return { title: "Medienkit", robots: { index: false } };
  return { title: `Medienkit · ${kit.profile.displayName}`, description: kit.profile.bio?.slice(0, 160) || `Arbeiten und Zahlen von ${kit.profile.displayName} auf Werkuno.`, robots: { index: false } };
}

/** Creator Pro: Medienkit – beste Arbeiten und ehrlich beschriftete Zahlen auf einer Seite (druckbar). */
export default async function MediaKitPage({ params }: Props) {
  const { handle } = await params;
  const viewer = await currentUser();
  const kit = await getMediaKit(handle, viewer?.id);
  if (!kit) notFound();
  const p = kit.profile;
  const s = kit.stats;
  const nf = (n: number) => compactNumber(n);
  const figures = [
    { label: "Follower", value: nf(s.followers), note: "Personen, die dem Profil folgen" },
    { label: "Aufrufe · 90 Tage", value: nf(s.views90), note: "Seitenaufrufe der Inhalte, ohne eigene" },
    { label: "Gemerkt", value: nf(s.saves), note: "So oft wurden Projekte und Anleitungen gespeichert" },
    { label: "Nachbauten", value: nf(s.remixes), note: "Projekte, die andere nachgebaut haben" },
    { label: "Projekte", value: nf(s.projects), note: "Öffentlich veröffentlicht" },
    { label: "Anleitungen", value: nf(s.tutorials), note: s.completions ? `${nf(s.completions)} Mal bis zum Ende befolgt` : "Schritt für Schritt erklärt" },
  ];
  const links = [...(p.website ? [{ url: p.website, label: p.website.replace(/^https?:\/\//, "") }] : []), ...p.links].slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 md:py-10 lg:px-10 print:max-w-none print:p-0">
      <div className="mb-8 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/u/${p.handle}`} className="mr-auto text-[13px] text-muted hover:text-ink">
          ← Zum Profil
        </Link>
        <PrintButton />
        <ShareButton variant="button" label url={`/u/${p.handle}/medienkit`} title={`Medienkit · ${p.displayName}`} image={p.avatarUrl} />
      </div>
      {kit.isOwner && !kit.public && (
        <Notice tone="warn" className="mb-8 print:hidden" title="Nur für dich sichtbar">
          Gib dein Medienkit im <Link href="/studio/pro" className="font-semibold underline">Werkuno Studio unter Creator Pro</Link> frei, damit andere es über den Link sehen können.
        </Notice>
      )}

      <article className="overflow-hidden rounded-3xl border border-line bg-card print:rounded-none print:border-0">
        <header className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-10">
          <Avatar src={p.avatarUrl} name={p.displayName} size={112} className="rounded-3xl" />
          <div className="min-w-0">
            <p className="spec mb-2 flex items-center gap-2">Medienkit <ProMark /></p>
            <h1 className="display text-4xl sm:text-5xl">{p.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
              <span>@{p.handle}</span>
              {p.region && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} aria-hidden /> {p.region}
                </span>
              )}
              <span>Auf Werkuno seit {formatDate(p.memberSince, { month: "long", year: "numeric" })}</span>
            </p>
            {p.bio && <p className="mt-4 max-w-2xl whitespace-pre-line text-[15.5px] leading-relaxed text-ink-2">{p.bio}</p>}
            {p.categories.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {p.categories.map((c) => {
                  const cat = categoryBySlug(c);
                  return cat ? (
                    <li key={c} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-[13px]">
                      <Glyph name={cat.glyph} size={14} strokeWidth={1.5} /> {cat.name}
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </div>
        </header>

        <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-3">
          {figures.map((f, i) => (
            <div key={f.label} className={`p-5 sm:p-6 ${i % 2 === 1 ? "border-l border-line" : ""} sm:border-l sm:[&:nth-child(3n+1)]:border-l-0 ${i >= 2 ? "border-t border-line" : ""} sm:[&:nth-child(-n+3)]:border-t-0`}>
              <dt className="text-[12.5px] font-medium text-muted">{f.label}</dt>
              <dd className="num mt-1 text-[2rem] font-bold leading-none tracking-tight">{f.value}</dd>
              <dd className="mt-2 text-[12px] leading-snug text-muted">{f.note}</dd>
            </div>
          ))}
        </dl>

        {kit.shop && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-4 text-[14px] sm:px-10">
            <Store size={16} className="text-muted" aria-hidden />
            <span>
              Shop <Link href={`/markt/${kit.shop.slug}`} className="font-semibold hover:underline">{kit.shop.name}</Link>
            </span>
            {kit.shop.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Star size={13} className="fill-clay text-clay" aria-hidden />
                <span className="num font-semibold text-ink">{kit.shop.ratingAvg.toFixed(1)}</span> aus {kit.shop.ratingCount} Bewertungen
              </span>
            )}
          </div>
        )}

        {kit.topProjects.length > 0 && (
          <section className="p-6 sm:p-10" aria-labelledby="mk-arbeiten">
            <h2 id="mk-arbeiten" className="mb-5 text-[15px] font-bold tracking-tight">Ausgewählte Arbeiten</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 print:grid-cols-3">
              {kit.topProjects.map((pr) => (
                <ProjectCard key={pr.id} project={pr} showAuthor={false} ratio="4/3" />
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-sunken/60 px-6 py-5 sm:px-10">
          <p className="mr-auto text-[14px] font-semibold">Zusammenarbeit anfragen</p>
          {p.dmOpen && (
            <LinkButton href={`/nachrichten/neu?an=${p.handle}`} className="print:hidden">
              <MessageSquare size={15} aria-hidden /> Nachricht senden
            </LinkButton>
          )}
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-[14px] text-moss hover:underline">
              <Link2 size={13} aria-hidden /> {l.label || l.url.replace(/^https?:\/\//, "")}
            </a>
          ))}
          <span className="hidden text-[13px] text-muted print:inline">werkuno.ch/u/{p.handle}</span>
        </footer>
      </article>
      <p className="mt-4 text-[12px] leading-relaxed text-muted">
        Zahlen live von Werkuno, Stand {formatDate(kit.generatedAt, { day: "numeric", month: "long", year: "numeric" })}. Aufrufe zählen Seitenaufrufe, nicht eindeutige Personen; wiederholte Aufrufe innerhalb von 30 Minuten zählen einmal, eigene nie.
      </p>
    </div>
  );
}
