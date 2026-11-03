import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { after } from "next/server";
import { ArrowRight, ArrowUpRight, GitFork } from "lucide-react";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, categoryBySlug, formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getProjectPage, recordProjectView, type ProjectPageView } from "@/server/projects/service";
import { Page } from "@/components/shell/page";
import { Avatar, Difficulty, Empty, Notice, SectionTitle } from "@/components/ui/misc";
import { Cover, MediaImage } from "@/components/ui/media";
import { LinkButton } from "@/components/ui/button";
import { Comments } from "@/components/social/comments";
import { FollowButton } from "@/components/social/actions";
import { ProjectGallery } from "@/components/projects/project-gallery";
import { ProjectThread } from "@/components/projects/project-thread";
import { ProjectActions, ProjectOwnerBar } from "@/components/projects/project-actions";
import { JournalComposer, DeleteJournalEntry } from "@/components/projects/journal-composer";
import { ProjectCard } from "@/components/projects/project-card";
import { ProductMiniCard, ArticleMiniCard } from "@/components/projects/linked-cards";
import { StatusLabel, StatusMark } from "@/components/projects/status";
import { JsonLd, absUrl, isoDuration } from "@/components/projects/json-ld";
import { AddToShoppingList } from "@/components/materials/add-to-list";
import { cn, formatDate, formatMinutes, pad, relativeTime } from "@/lib/utils";

type Params = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle, slug } = await params;
  const user = await currentUser();
  const r = await getProjectPage(handle, slug, user?.id ?? null);
  if (!r || r.kind !== "ok") return { title: "Projekt nicht gefunden", robots: { index: false } };
  const p = r.project;
  const description = (p.description.replace(/\s+/g, " ").trim().slice(0, 158) || `${p.title} – ein ${categoryBySlug(p.category)?.name ?? "DIY"}-Projekt von ${p.owner.displayName}.`).trim();
  return {
    title: `${p.title} – ${p.owner.displayName}`,
    description,
    alternates: { canonical: p.href },
    robots: p.visibility === "PUBLIC" && p.state === "PUBLISHED" ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: p.title,
      description,
      url: p.href,
      images: p.coverUrl ? [{ url: p.coverUrl, alt: p.cover?.alt || p.title }] : undefined,
      publishedTime: p.publishedAt,
      modifiedTime: p.updatedAt,
      authors: [p.owner.displayName],
      tags: p.tags,
    },
  };
}

/** Werkblatt-Nummer: stabile, kurze Kennung fürs Datenblatt (rein dekorativ). */
function sheetNo(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return String(h % 10000).padStart(4, "0");
}

export default async function ProjectPage({ params }: Params) {
  const { handle, slug } = await params;
  const user = await currentUser();
  const r = await getProjectPage(handle, slug, user?.id ?? null);
  if (!r) notFound();
  if (r.kind === "redirect") permanentRedirect(r.to);
  const p = r.project;
  if (!p.viewer.isOwner) after(() => recordProjectView(p.id));

  const cat = categoryBySlug(p.category);
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl } : null;
  const isOwner = p.viewer.isOwner;
  let sec = 0;
  const no = () => pad(++sec);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    description: p.description.slice(0, 500) || undefined,
    url: absUrl(p.href),
    image: p.coverUrl ? absUrl(p.coverUrl) : undefined,
    dateCreated: p.createdAt,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt,
    inLanguage: "de-CH",
    genre: cat?.name,
    keywords: p.tags.join(", ") || undefined,
    creativeWorkStatus: PROJECT_STATUS_LABEL[p.status],
    author: { "@type": "Person", name: p.owner.displayName, url: absUrl(`/u/${p.owner.handle}`) },
    material: p.materials.length ? p.materials.map((m) => [m.quantity, m.name].filter(Boolean).join(" ")) : undefined,
    timeRequired: isoDuration(p.actualMinutes ?? p.estimatedMinutes),
    isBasedOn: p.remixOf ? absUrl(p.remixOf.href) : undefined,
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: p.counts.likes },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: p.counts.comments },
    ],
  };

  return (
    <Page width="wide">
      {p.visibility === "PUBLIC" && p.state === "PUBLISHED" && <JsonLd data={jsonLd} />}

      {/* Kopfzeile des Werkblatts */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-3">
        <nav aria-label="Brotkrumen" className="spec flex min-w-0 items-center gap-2">
          <Link href="/projekte" className="hover:text-ink">Projekte</Link>
          <span aria-hidden>/</span>
          {cat && (
            <>
              <Link href={`/projekte?kategorie=${cat.slug}`} className="truncate hover:text-ink">{cat.short}</Link>
              <span aria-hidden>/</span>
            </>
          )}
          <span className="truncate text-ink">{p.owner.handle}</span>
        </nav>
        <span className="spec shrink-0">Werkblatt Nr. {sheetNo(p.id)}</span>
      </div>

      {isOwner && (
        <div className="mb-6 space-y-3">
          <ProjectOwnerBar project={{ id: p.id, href: p.href, status: p.status }} ownerHandle={p.owner.handle} />
          {p.state === "HIDDEN" && <Notice tone="warn" title="Von der Moderation ausgeblendet">Dieses Projekt ist derzeit nur für dich sichtbar. Details findest du in deinen Benachrichtigungen.</Notice>}
          {p.visibility !== "PUBLIC" && <Notice>Sichtbarkeit: {p.visibility === "PRIVATE" ? "Nur du siehst dieses Projekt." : "Nur Menschen, die dir folgen, sehen dieses Projekt."}</Notice>}
        </div>
      )}

      {/* ───── Kopf: Galerie + Titelblock + Datenblatt ───── */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12">
        <ProjectGallery items={p.gallery} title={p.title} seed={p.id} category={p.category} initialId={p.cover?.id} />

        <div className="min-w-0">
          <p className="spec flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusLabel status={p.status} className="text-ink" />
            {cat && <span>· {cat.name}</span>}
          </p>
          <h1 className="display mt-3 text-[2.5rem] text-balance sm:text-[3.2rem]">{p.title}</h1>
          {p.remixOf && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <GitFork size={14} className="shrink-0 text-clay" />
              <span>
                Nachbau von{" "}
                <Link href={p.remixOf.href} className="font-semibold text-ink underline decoration-1 underline-offset-2">«{p.remixOf.title}»</Link> von {p.remixOf.ownerName}
              </span>
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Link href={`/u/${p.owner.handle}`} className="shrink-0">
              <Avatar src={p.owner.avatarUrl} name={p.owner.displayName} size={44} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/u/${p.owner.handle}`} className="block truncate font-semibold hover:underline">{p.owner.displayName}</Link>
              <p className="truncate text-[13px] text-muted">
                @{p.owner.handle} · {p.owner.projectCount} {p.owner.projectCount === 1 ? "Projekt" : "Projekte"}
              </p>
            </div>
            {!isOwner && viewer && <FollowButton userId={p.owner.id} following={p.viewer.followingOwner} size="sm" />}
          </div>
          {p.contributors.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span className="spec">Mit</span>
              {p.contributors.map((c) => (
                <Link key={c.handle} href={`/u/${c.handle}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                  <Avatar src={c.avatarUrl} name={c.displayName} size={18} /> {c.displayName}
                </Link>
              ))}
            </p>
          )}

          <div className="mt-6">
            <ProjectActions
              project={{ id: p.id, title: p.title, href: p.href, status: p.status }}
              owner={{ id: p.owner.id, handle: p.owner.handle, displayName: p.owner.displayName }}
              viewer={{ signedIn: !!viewer, isOwner, liked: p.viewer.liked, saved: p.viewer.saved, followingProject: p.viewer.followingProject }}
              counts={{ likes: p.counts.likes, followers: p.counts.followers }}
            />
          </div>

          <SpecSheet p={p} />

          {p.tags.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Schlagwörter">
              {p.tags.map((t) => (
                <li key={t}>
                  <Link href={`/projekte?q=${encodeURIComponent(t)}`} className="inline-flex h-7 items-center border border-line px-2.5 font-mono text-[11px] text-ink-2 hover:border-ink">#{t}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ───── Körper: Abschnitte + Projektfaden ───── */}
      <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-16">
          <section id="beschreibung" aria-labelledby="h-beschreibung">
            <SectionTitle n={no()} title={<span id="h-beschreibung">Idee & Beschreibung</span>} />
            {p.description ? (
              <div className="prose-werk mt-6 max-w-[68ch] whitespace-pre-line">{p.description}</div>
            ) : (
              <p className="mt-6 text-sm text-muted">{isOwner ? "Noch keine Beschreibung. Erzähle, was dich zu diesem Projekt gebracht hat." : "Keine Beschreibung."}</p>
            )}
            {p.remixOf && p.remixOf.deviations && (
              <div className="mt-8 max-w-[68ch] border-l-2 border-clay bg-clay-soft px-5 py-4">
                <p className="spec text-clay-ink">Abweichungen zum Original</p>
                <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{p.remixOf.deviations}</p>
              </div>
            )}
          </section>

          <div className="lg:hidden">
            <ProjectThread project={p} variant="inline" />
          </div>

          <section id="journal" aria-labelledby="h-journal">
            <SectionTitle
              n={no()}
              title={<span id="h-journal">Journal</span>}
              action={p.journal.length > 0 ? <span className="spec">{p.journal.length} {p.journal.length === 1 ? "Eintrag" : "Einträge"}{p.journalMinutes ? ` · ${formatMinutes(p.journalMinutes)} erfasst` : ""}</span> : undefined}
            />
            <Journal p={p} />
            {isOwner && (
              <div className="mt-2 sm:pl-[calc(6.5rem+1.25rem)]">
                <JournalComposer projectId={p.id} entryNumber={p.journal.length + 1} defaultShare={p.visibility === "PUBLIC"} />
              </div>
            )}
          </section>

          {(p.materials.length > 0 || p.tools.length > 0 || isOwner) && (
            <section id="material" aria-labelledby="h-material">
              <SectionTitle
                n={no()}
                title={<span id="h-material">Material & Werkzeug</span>}
                action={p.materials.length > 0 ? <AddToShoppingList kind="PROJECT" id={p.id} title={p.title} count={p.materials.length} signedIn={!!viewer} /> : undefined}
              />
              <Materials p={p} />
            </section>
          )}

          {(p.tutorials.length > 0 || isOwner) && (
            <section id="anleitung" aria-labelledby="h-anleitung">
              <SectionTitle n={no()} title={<span id="h-anleitung">Anleitung</span>} />
              {p.tutorials.length ? (
                <div className="mt-6 space-y-4">
                  {p.tutorials.map((t) => (
                    <Link key={t.id} href={t.state === "PUBLISHED" ? `/anleitungen/${t.slug}` : `/studio/anleitungen/${t.id}`} className="group grid gap-0 border border-line bg-card transition-colors hover:border-ink sm:grid-cols-[14rem_1fr]">
                      <div className="border-b border-line sm:border-b-0 sm:border-r">
                        <Cover url={t.coverUrl} alt="" seed={`t-${t.id}`} category={t.category} ratio="3/2" sizes="224px" className="h-full" />
                      </div>
                      <div className="flex flex-col gap-3 p-5">
                        <p className="spec">
                          {t.state === "PUBLISHED" ? `Anleitung · Version ${t.version ?? 1} · ${t.steps} Schritte` : "Entwurf · nur für dich sichtbar"}
                          {t.minutes ? ` · ${formatMinutes(t.minutes)}` : ""}
                        </p>
                        <p className="headline text-2xl text-balance group-hover:underline decoration-1 underline-offset-4">{t.title}</p>
                        {t.summary && <p className="line-clamp-2 text-sm text-muted">{t.summary}</p>}
                        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                          <span className="flex items-center gap-2 text-[13px] text-muted">
                            <Difficulty level={t.difficulty} /> {DIFFICULTY_LABEL[t.difficulty]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-sm font-semibold">
                            {t.state === "PUBLISHED" ? "Anleitung öffnen" : "Weiter bearbeiten"} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  className="mt-6"
                  title="Noch keine Anleitung"
                  body="Mach aus deinem Projekt eine Schritt-für-Schritt-Anleitung, damit andere es nachbauen können."
                  action={<LinkButton href={`/studio/anleitungen/neu?projekt=${p.id}`} variant="ink">Anleitung schreiben</LinkButton>}
                />
              )}
            </section>
          )}

          <section id="fragen" aria-labelledby="h-fragen">
            <SectionTitle n={no()} title={<span id="h-fragen">Fragen & Kommentare</span>} action={p.counts.comments > 0 ? <span className="spec">{p.counts.comments}</span> : undefined} />
            <div className="mt-6 max-w-[68ch]">
              <Comments targetType="PROJECT" targetId={p.id} initial={p.comments} viewer={viewer} questionsMode placeholder="Frage stellen oder Feedback geben …" />
            </div>
          </section>

          <section id="nachbauten" aria-labelledby="h-nachbauten">
            <SectionTitle
              n={no()}
              title={<span id="h-nachbauten">Nachbauten</span>}
              action={!isOwner ? <Link href={`/projekte/neu?nachbau=${p.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline"><GitFork size={14} /> Eigenen Nachbau starten</Link> : undefined}
            />
            {p.remixes.length ? (
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3">
                {p.remixes.map((rm) => (
                  <ProjectCard
                    key={rm.id}
                    project={rm}
                    ratio="1/1"
                    footer={rm.deviations ? <p className="mt-2 line-clamp-3 border-l border-clay pl-2.5 text-[13px] leading-snug text-muted">{rm.deviations}</p> : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-6 max-w-[60ch] text-sm text-muted">
                {isOwner ? "Noch hat niemand dein Projekt nachgebaut. Nachbauten erscheinen hier und verweisen auf dein Original." : "Noch keine Nachbauten. Baust du es nach? Dein Projekt verweist dann auf dieses Original – Texte und Dateien werden nicht kopiert."}
              </p>
            )}
          </section>

          {(p.products.length > 0 || isOwner) && (
            <section id="produkte" aria-labelledby="h-produkte">
              <SectionTitle n={no()} title={<span id="h-produkte">Produkte aus diesem Projekt</span>} />
              {p.products.length ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {p.products.map((pr) => (
                    <ProductMiniCard key={pr.id} product={pr} />
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted">
                  Verkaufst du Stücke, Materialsets oder Vorlagen zu diesem Projekt?{" "}
                  <Link href={`/studio/produkte/neu?projekt=${p.id}`} className="font-semibold text-ink underline underline-offset-2">Produkt anlegen</Link>
                </p>
              )}
            </section>
          )}

          {p.articles.length > 0 && (
            <section id="artikel" aria-labelledby="h-artikel">
              <SectionTitle n={no()} title={<span id="h-artikel">Weiterlesen im Blog</span>} />
              <div className="mt-4">
                {p.articles.map((a) => (
                  <ArticleMiniCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          )}

          {p.posts.length > 0 && (
            <section id="beitraege" aria-labelledby="h-beitraege">
              <SectionTitle n={no()} title={<span id="h-beitraege">Im Feed</span>} />
              <ul className="mt-4 divide-y divide-line">
                {p.posts.map((post) => (
                  <li key={post.id}>
                    <Link href={`/beitrag/${post.id}`} className="group flex items-baseline justify-between gap-4 py-3">
                      <span className="line-clamp-1 text-[15px] text-ink-2 group-hover:text-ink">{post.excerpt || "Beitrag mit Medien"}</span>
                      <span className="spec shrink-0">{relativeTime(post.publishedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="hidden lg:block" aria-label="Projektfaden und Kontext">
          <div className="sticky top-10 space-y-10">
            <ProjectThread project={p} />
            <div className="border-t border-line pt-5">
              <p className="spec">Gebaut von</p>
              <Link href={`/u/${p.owner.handle}`} className="mt-3 flex items-center gap-3 group">
                <Avatar src={p.owner.avatarUrl} name={p.owner.displayName} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold group-hover:underline">{p.owner.displayName}</span>
                  <span className="block text-xs text-muted">{p.owner.followerCount} Follower</span>
                </span>
              </Link>
              {p.owner.bio && <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-muted">{p.owner.bio}</p>}
            </div>
          </div>
        </aside>
      </div>
    </Page>
  );
}

function SpecSheet({ p }: { p: ProjectPageView }) {
  const cat = categoryBySlug(p.category);
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Schwierigkeit",
      value: (
        <span className="flex items-center gap-2">
          <Difficulty level={p.difficulty} /> <span>{DIFFICULTY_LABEL[p.difficulty]}</span>
        </span>
      ),
    },
    { label: "Status", value: <span className="flex items-center gap-2"><StatusMark status={p.status} />{PROJECT_STATUS_LABEL[p.status]}</span> },
    { label: "Geschätzte Zeit", value: formatMinutes(p.estimatedMinutes) },
    { label: "Tatsächliche Zeit", value: p.actualMinutes ? formatMinutes(p.actualMinutes) : p.journalMinutes ? <span>{formatMinutes(p.journalMinutes)} <span className="font-normal text-muted">laut Journal</span></span> : "–" },
    { label: "Budget", value: p.budgetMinor != null ? formatMoney(p.budgetMinor, p.currency) : "–" },
    { label: "Kategorie", value: cat ? <Link href={`/projekte?kategorie=${cat.slug}`} className="hover:underline">{cat.name}</Link> : "–" },
    { label: "Begonnen", value: formatDate(p.publishedAt) },
    p.completedAt ? { label: "Abgeschlossen", value: formatDate(p.completedAt) } : { label: "Zuletzt aktiv", value: relativeTime(p.updatedAt) },
  ];
  return (
    <section aria-label="Datenblatt" className="mt-6">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="spec text-ink">Datenblatt</h2>
        <span className="spec">{p.counts.views > 0 ? `${p.counts.views} Aufrufe` : ""}</span>
      </div>
      <dl className="grid grid-cols-2">
        {rows.map((r, i) => (
          <div key={r.label} className={cn("border-b border-line py-3", i % 2 === 0 ? "pr-4" : "border-l pl-4")}>
            <dt className="spec">{r.label}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-ink num">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Journal({ p }: { p: ProjectPageView }) {
  if (!p.journal.length) {
    return <p className="mt-6 text-sm text-muted">{p.viewer.isOwner ? "Halte hier deine Arbeitsschritte fest – mit Fotos, Zeit und auch mit dem, was nicht geklappt hat." : "Noch keine Journaleinträge."}</p>;
  }
  const finished = !!p.completedAt;
  return (
    <ol className="mt-8">
      {p.journal.map((e, i) => {
        const last = i === p.journal.length - 1;
        return (
          <li key={e.id} id={`eintrag-${e.id}`} className="grid scroll-mt-24 grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-5">
            <div className="pt-0.5 text-right">
              <span className="block font-mono text-[12px] font-semibold text-ink num">{pad(i + 1)}</span>
              <time dateTime={e.happenedAt} className="spec block">{formatDate(e.happenedAt, { day: "numeric", month: "short" })}</time>
              <span className="spec hidden sm:block">{formatDate(e.happenedAt, { year: "numeric" })}</span>
              {e.minutes ? <span className="spec mt-1 block text-ink-2">{formatMinutes(e.minutes)}</span> : null}
            </div>
            <div className={cn("relative min-w-0 pb-12 pl-6", last && !finished ? "border-l border-dashed border-muted" : "border-l border-ink", last && finished && "pb-6")}>
              <span aria-hidden className={cn("absolute -left-px top-[5px] -translate-x-1/2", e.milestone ? "size-[10px] rotate-45 bg-clay" : "size-[9px] rounded-full border border-ink bg-paper")} />
              {e.milestone && (
                <>
                  <p className="spec text-clay-ink">Meilenstein</p>
                  <h3 className="headline mt-0.5 text-[1.4rem] text-balance">{e.milestone}</h3>
                </>
              )}
              <p className={cn("whitespace-pre-line text-[15.5px] leading-relaxed text-ink-2", e.milestone && "mt-2")}>{e.body}</p>
              {(e.problem || e.solution) && (
                <div className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-2">
                  {e.problem && (
                    <div className="bg-clay-soft px-4 py-3">
                      <p className="spec text-clay-ink">Problem</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-2">{e.problem}</p>
                    </div>
                  )}
                  <div className={cn("bg-moss-soft px-4 py-3", !e.problem && "sm:col-span-2")}>
                    <p className="spec text-moss-ink">Lösung</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-2">{e.solution || <span className="text-muted">Noch offen – weisst du Rat? Schreib es in die Fragen.</span>}</p>
                  </div>
                </div>
              )}
              {e.media.length > 0 && (
                <ul className={cn("mt-4 grid gap-2", e.media.length === 1 ? "grid-cols-1 sm:w-3/4" : e.media.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
                  {e.media.map((m) => (
                    <li key={m.mediaId} className="relative overflow-hidden border border-line bg-sunken" style={{ aspectRatio: e.media.length === 1 ? "4/3" : "1/1" }}>
                      <MediaImage url={m.url} alt={m.alt} className="absolute inset-0" sizes="(min-width: 1024px) 320px, 50vw" />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-3 text-[13px] text-muted">
                {e.author.id !== p.owner.id && (
                  <Link href={`/u/${e.author.handle}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                    <Avatar src={e.author.avatarUrl} name={e.author.displayName} size={18} /> {e.author.displayName}
                  </Link>
                )}
                {e.postId && (
                  <Link href={`/beitrag/${e.postId}`} className="inline-flex items-center gap-1 hover:text-ink">
                    Im Feed <ArrowUpRight size={13} />
                  </Link>
                )}
                {e.canDelete && <DeleteJournalEntry id={e.id} className="-my-1 ml-auto" />}
              </div>
            </div>
          </li>
        );
      })}
      {finished && (
        <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-5">
          <div className="text-right">
            <time dateTime={p.completedAt!} className="spec block text-moss-ink">{formatDate(p.completedAt!, { day: "numeric", month: "short" })}</time>
          </div>
          <div className="relative pl-6">
            <span aria-hidden className="absolute -left-px top-[4px] size-[11px] -translate-x-1/2 bg-moss" />
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-moss-ink">Abgeschlossen</p>
          </div>
        </li>
      )}
    </ol>
  );
}

function Materials({ p }: { p: ProjectPageView }) {
  if (!p.materials.length && !p.tools.length) {
    return <p className="mt-6 text-sm text-muted">Noch keine Materialliste. Ergänze sie über «Bearbeiten», damit andere direkt einkaufen können.</p>;
  }
  return (
    <div className="mt-6 grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {p.materials.length > 0 && (
        <div className="min-w-0">
          <table className="w-full border-collapse text-[14px]">
            <caption className="spec mb-2 text-left">Material · {p.materials.length} Positionen</caption>
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="spec w-10 py-2 font-normal">Pos.</th>
                <th scope="col" className="spec py-2 font-normal">Material</th>
                <th scope="col" className="spec py-2 pl-3 text-right font-normal">Menge</th>
              </tr>
            </thead>
            <tbody>
              {p.materials.map((m, i) => (
                <tr key={m.id} className="border-b border-line align-top">
                  <td className="py-2.5 font-mono text-[11px] text-muted num">{pad(i + 1)}</td>
                  <td className="py-2.5">
                    {m.materialSlug ? (
                      <Link href={`/materialien?q=${encodeURIComponent(m.name)}`} className="font-semibold hover:underline">{m.name}</Link>
                    ) : (
                      <span className="font-semibold">{m.name}</span>
                    )}
                    {m.note && <span className="block text-[13px] text-muted">{m.note}</span>}
                    {m.safetyInfo && <span className="mt-1 block text-[12px] text-warn">Hinweis: {m.safetyInfo}</span>}
                  </td>
                  <td className="py-2.5 pl-3 text-right num text-ink-2">{m.quantity || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.viewer.isOwner && (
            <p className="mt-3 text-[13px] text-muted">
              Willst du es nachbauen?{" "}
              <Link href={`/projekte/neu?nachbau=${p.id}`} className="font-semibold text-ink underline underline-offset-2">Nachbau mit dieser Materialliste starten</Link>
            </p>
          )}
        </div>
      )}
      {p.tools.length > 0 && (
        <div className="min-w-0">
          <p className="spec mb-2">Werkzeug · {p.tools.length}</p>
          <ul className="border-t border-ink">
            {p.tools.map((t) => (
              <li key={t.id} className="flex items-baseline gap-3 border-b border-line py-2.5 text-[14px]">
                <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-ink" />
                <span className="min-w-0">
                  <span className="font-semibold">{t.name}</span>
                  {t.note && <span className="block text-[13px] text-muted">{t.note}</span>}
                  {t.safetyInfo && <span className="mt-1 block text-[12px] text-warn">Sicherheit: {t.safetyInfo}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

