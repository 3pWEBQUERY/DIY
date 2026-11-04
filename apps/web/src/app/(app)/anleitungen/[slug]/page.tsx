import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { DIFFICULTY_LABEL, SAFETY_LABEL, categoryBySlug, formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getTutorialPage, recordTutorialView, type TutorialPageView } from "@/server/tutorials/service";
import { Page } from "@/components/shell/page";
import { Avatar, Difficulty, Notice, SectionTitle } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { Comments } from "@/components/social/comments";
import { FollowButton } from "@/components/social/actions";
import { TutorialReader } from "@/components/tutorials/tutorial-reader";
import { TutorialActions, VersionBanner } from "@/components/tutorials/tutorial-actions";
import { ProductMiniCard } from "@/components/projects/linked-cards";
import { StatusLabel } from "@/components/projects/status";
import { JsonLd, absUrl, isoDuration } from "@/components/projects/json-ld";
import { AddToShoppingList } from "@/components/materials/add-to-list";
import { cn, formatDate, formatMinutes, pad } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  if (!t) return { title: "Anleitung nicht gefunden", robots: { index: false } };
  const description = (t.summary.replace(/\s+/g, " ").trim().slice(0, 158) || `Schritt-für-Schritt-Anleitung: ${t.title} – ${t.steps.length} Schritte, ${DIFFICULTY_LABEL[t.difficulty]}.`).trim();
  return {
    title: `${t.title} – Anleitung`,
    description,
    alternates: { canonical: t.href },
    robots: t.state === "PUBLISHED" && !t.preview ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: t.title,
      description,
      url: t.href,
      images: t.coverUrl ? [{ url: t.coverUrl, alt: t.title }] : undefined,
      publishedTime: t.publishedAt ?? undefined,
      modifiedTime: t.version.publishedAt,
      authors: [t.author.displayName],
    },
  };
}

function howTo(t: TutorialPageView) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t.title,
    description: t.summary || undefined,
    url: absUrl(t.href),
    image: t.coverUrl ? absUrl(t.coverUrl) : undefined,
    inLanguage: t.language,
    totalTime: isoDuration(t.minutes),
    datePublished: t.publishedAt ?? undefined,
    dateModified: t.version.publishedAt,
    version: String(t.version.number),
    author: { "@type": "Person", name: t.author.displayName, url: absUrl(`/u/${t.author.handle}`) },
    estimatedCost: t.isPaid && t.priceMinor ? { "@type": "MonetaryAmount", currency: "CHF", value: (t.priceMinor / 100).toFixed(2) } : undefined,
    supply: t.materials.map((m) => ({ "@type": "HowToSupply", name: m.name, requiredQuantity: m.quantity || undefined })),
    tool: t.tools.map((x) => ({ "@type": "HowToTool", name: x.name })),
    step: t.steps.map((s) => ({
      "@type": "HowToStep",
      position: s.position + 1,
      name: s.title,
      text: [s.body, s.safety ? `Sicherheitshinweis: ${s.safety}` : ""].filter(Boolean).join("\n\n") || s.title,
      url: absUrl(`${t.href}#schritt-${s.position + 1}`),
      image: s.media[0]?.url ? absUrl(s.media[0].url) : undefined,
    })),
  };
}

export default async function TutorialPage({ params }: Params) {
  const { slug } = await params;
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  if (!t) notFound();
  if (!t.viewer.isOwner && !t.preview) after(() => recordTutorialView(t.id));

  const cat = categoryBySlug(t.category);
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl } : null;
  const newVersion = t.viewer.hasProgress && t.viewer.versionSeen != null && t.viewer.versionSeen < t.version.number;
  const remixHref = t.project ? `/projekte/neu?nachbau=${t.project.id}` : `/projekte/neu?kategorie=${t.category}`;
  const stepsMinutes = t.steps.reduce((a, s) => a + (s.minutes ?? 0), 0);
  let sec = 0;
  const no = () => pad(++sec);

  return (
    <Page width="wide">
      {t.state === "PUBLISHED" && !t.preview && <JsonLd data={howTo(t)} />}

      <div className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-3">
        <nav aria-label="Brotkrumen" className="spec flex min-w-0 items-center gap-2">
          <Link href="/anleitungen" className="hover:text-ink">Anleitungen</Link>
          {cat && (
            <>
              <span aria-hidden>/</span>
              <Link href={`/anleitungen?kategorie=${cat.slug}`} className="truncate hover:text-ink">{cat.short}</Link>
            </>
          )}
        </nav>
        <span className="spec shrink-0">{t.preview ? "Vorschau · Entwurf" : `Version ${t.version.number} · ${formatDate(t.version.publishedAt, { day: "numeric", month: "short", year: "numeric" })}`}</span>
      </div>

      <div className="space-y-3">
        {t.preview && (
          <Notice tone="warn" title="Vorschau deines Entwurfs">
            Diese Anleitung ist noch nicht veröffentlicht und nur für dich sichtbar.{" "}
            <Link href={`/studio/anleitungen/${t.id}`} className="font-semibold underline underline-offset-2">Im Studio bearbeiten</Link>
          </Notice>
        )}
        {t.viewer.isOwner && t.state === "DRAFT" && !t.preview && <Notice>Zurückgezogen – nur du siehst diese Anleitung.</Notice>}
        {t.state === "HIDDEN" && t.viewer.isOwner && <Notice tone="warn" title="Von der Moderation ausgeblendet">Details findest du in deinen Benachrichtigungen.</Notice>}
        {newVersion && <VersionBanner tutorialId={t.id} version={t.version.number} changeNote={t.version.changeNote} isMajor={t.version.isMajor} publishedAt={t.version.publishedAt} />}
      </div>

      {/* ───── Kopf ───── */}
      <header className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end">
        <div className="min-w-0">
          <p className="spec flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-rule-strong" />
            Anleitung{cat ? ` · ${cat.name}` : ""}
          </p>
          <h1 className="display mt-4 text-[2.5rem] text-balance sm:text-[3.4rem]">{t.title}</h1>
          {t.summary && <p className="mt-4 max-w-[52ch] font-serif text-[1.25rem] leading-relaxed text-ink-2 text-pretty">{t.summary}</p>}
          <div className="mt-6 flex items-center gap-3">
            <Link href={`/u/${t.author.handle}`} className="shrink-0">
              <Avatar src={t.author.avatarUrl} name={t.author.displayName} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted">Von</p>
              <Link href={`/u/${t.author.handle}`} className="block truncate font-semibold hover:underline">{t.author.displayName}</Link>
            </div>
            {!t.viewer.isOwner && viewer && <FollowButton userId={t.author.id} following={t.viewer.followingAuthor} size="sm" />}
          </div>
        </div>
        <div className="crop border border-line rounded-2xl">
          <Cover url={t.coverUrl} alt={t.title} seed={`t-${t.id}`} category={t.category} ratio="16/10" priority sizes="(min-width: 1024px) 600px, 100vw" />
        </div>
      </header>

      <div className="mt-8">
        <TutorialActions
          tutorial={{ id: t.id, title: t.title, href: t.href }}
          author={{ id: t.author.id, displayName: t.author.displayName }}
          viewer={{ signedIn: !!viewer, isOwner: t.viewer.isOwner, liked: t.viewer.liked, saved: t.viewer.saved }}
          likes={t.counts.likes}
        />
      </div>

      {/* Datenblatt */}
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Schwierigkeit", value: <span className="flex items-center gap-2"><Difficulty level={t.difficulty} />{DIFFICULTY_LABEL[t.difficulty]}</span> },
          { label: "Dauer", value: formatMinutes(t.minutes ?? (stepsMinutes || null)) },
          { label: "Schritte", value: t.steps.length },
          { label: "Kosten", value: t.isPaid && t.priceMinor ? formatMoney(t.priceMinor) : "Kostenlos" },
          { label: "Nachgebaut", value: `${t.counts.completions}×` },
          { label: "Aktualisiert", value: formatDate(t.version.publishedAt, { day: "numeric", month: "short", year: "numeric" }) },
        ].map((r) => (
          <div key={r.label} className="bg-paper px-3 py-3.5">
            <dt className="spec">{r.label}</dt>
            <dd className="mt-1 text-[15px] font-semibold num">{r.value}</dd>
          </div>
        ))}
      </dl>

      {t.safetyKinds.length > 0 && (
        <div role="note" className="mt-6 flex flex-wrap items-start gap-x-4 gap-y-2 border border-danger/40 border-l-[3px] border-l-danger bg-danger-soft px-5 py-4 rounded-2xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-danger">Sicherheit</p>
          <div className="min-w-0 flex-1 text-[14.5px] text-ink">
            <p>
              Diese Anleitung enthält Arbeiten mit: <strong>{t.safetyKinds.map((k) => SAFETY_LABEL[k]).join(", ")}</strong>. Die verbindlichen Hinweise stehen rot markiert direkt beim jeweiligen Schritt.
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Beachte immer die Angaben der Hersteller deiner Werkzeuge und Materialien.
            </p>
          </div>
        </div>
      )}

      {/* Material & Werkzeug */}
      {(t.materials.length > 0 || t.tools.length > 0) && (
        <section id="material" aria-labelledby="h-material" className="mt-14">
          <SectionTitle
            n={no()}
            title={<span id="h-material">Material & Werkzeug</span>}
            action={t.materials.length > 0 && !t.preview ? <AddToShoppingList kind="TUTORIAL" id={t.id} title={t.title} count={t.materials.length} signedIn={!!viewer} /> : undefined}
          />
          <div className="mt-6 grid gap-10 md:grid-cols-2">
            {t.materials.length > 0 && (
              <div>
                <p className="spec mb-2">Material · {t.materials.length}</p>
                <ul className="border-t border-rule">
                  {t.materials.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2.5 text-[14px]">
                      <span className="font-mono text-[11px] text-muted num">{pad(i + 1)}</span>
                      <span className="min-w-0">
                        <span className="font-semibold">{m.name}</span>
                        {m.note && <span className="block text-[13px] text-muted">{m.note}</span>}
                      </span>
                      <span className="num text-ink-2">{m.quantity || "–"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.tools.length > 0 && (
              <div>
                <p className="spec mb-2">Werkzeug · {t.tools.length}</p>
                <ul className="border-t border-rule">
                  {t.tools.map((x, i) => (
                    <li key={`${x.name}-${i}`} className="flex items-baseline gap-3 border-b border-line py-2.5 text-[14px]">
                      <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-rule-strong" />
                      <span className="min-w-0">
                        <span className="font-semibold">{x.name}</span>
                        {(x.quantity || x.note) && <span className="block text-[13px] text-muted">{[x.quantity, x.note].filter(Boolean).join(" · ")}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Schritte */}
      <section id="schritte" aria-labelledby="h-schritte" className="mt-14">
        <SectionTitle n={no()} title={<span id="h-schritte">Schritt für Schritt</span>} action={<span className="spec">{t.steps.length} Schritte</span>} />
        <div className="mt-8">
          <TutorialReader
            tutorialId={t.id}
            steps={t.steps}
            completedKeys={t.viewer.completedKeys}
            completedAt={t.viewer.completedAt}
            signedIn={!!viewer}
            isOwner={t.viewer.isOwner}
            preview={t.preview}
            remixHref={remixHref}
          />
        </div>
      </section>

      <p className="mt-10 max-w-[70ch] border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
        <span className="font-mono uppercase tracking-[0.08em] text-ink-2">Hinweis · </span>
        Tipps (grün) geben persönliche Erfahrungen wieder. Sicherheitshinweise (rot) beschreiben Risiken, ersetzen aber keine Herstellerangaben oder Fachberatung. Fehler entdeckt? Melde den betroffenen Schritt.
      </p>

      <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section id="fragen" aria-labelledby="h-fragen" className="min-w-0">
          <SectionTitle n={no()} title={<span id="h-fragen">Fragen zur Anleitung</span>} />
          <div className="mt-6 max-w-[68ch]">
            <Comments targetType="TUTORIAL" targetId={t.id} initial={t.comments} viewer={viewer} questionsMode placeholder="Frage zu einem Schritt stellen …" />
          </div>
        </section>

        <aside className="space-y-10" aria-label="Verknüpft">
          {t.project && (
            <section>
              <p className="spec mb-3 text-ink">Zum Projekt</p>
              <Link href={t.project.href} className="group block border-l border-rule pl-3">
                <div className="border border-line transition-colors group-hover:border-rule-strong rounded-2xl">
                  <Cover url={t.project.coverUrl} alt="" seed={t.project.id} category={t.project.category} ratio="4/3" sizes="320px" />
                </div>
                <p className="spec mt-2"><StatusLabel status={t.project.status} /></p>
                <p className="headline mt-1 text-xl group-hover:underline decoration-1 underline-offset-4">{t.project.title}</p>
                <p className="text-[13px] text-muted">von {t.project.ownerName}</p>
              </Link>
              {!t.viewer.isOwner && (
                <Link href={remixHref} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold hover:underline">
                  Eigenes Nachbauprojekt erstellen <ArrowUpRight size={13} />
                </Link>
              )}
            </section>
          )}
          {t.products.length > 0 && (
            <section>
              <p className="spec mb-3 text-ink">Passend im Marktplatz</p>
              <div className="space-y-2">
                {t.products.map((p) => (
                  <ProductMiniCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}
          {t.versions.length > 0 && (
            <section>
              <p className="spec mb-3 text-ink">Versionen</p>
              <ol className="border-l border-rule">
                {t.versions.slice(0, 8).map((v) => (
                  <li key={v.version} className="relative pb-4 pl-4 last:pb-0">
                    <span aria-hidden className={cn("absolute -left-px top-[5px] -translate-x-1/2", v.version === t.version.number ? "size-[9px] bg-ink rounded-full" : v.isMajor ? "size-[8px] rotate-45 bg-clay" : "size-[7px] rounded-full border border-rule bg-paper")} />
                    <p className="spec">
                      v{v.version} · {formatDate(v.publishedAt, { day: "numeric", month: "short", year: "numeric" })}
                      {v.isMajor ? " · wesentlich" : ""}
                    </p>
                    <p className="text-[13px] text-ink-2">{v.changeNote || "Ohne Änderungsnotiz"}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}
