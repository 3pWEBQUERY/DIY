import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { CATEGORIES, categoryBySlug } from "@werkraum/shared";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { listProjects, getProjectCards } from "@/server/projects/service";
import { listTutorials, getTutorialCards } from "@/server/tutorials/service";
import { suggestedCreators, suggestedCommunities } from "@/server/discovery/suggestions";
import { listPosts, baseFeedWhere } from "@/server/social/posts";
import { Page } from "@/components/shell/page";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard } from "@/components/tutorials/tutorial-card";
import { PostCard } from "@/components/social/post-card";
import { FollowButton } from "@/components/social/actions";
import { Avatar, SectionTitle, Empty } from "@/components/ui/misc";
import { Glyph } from "@/components/ui/glyphs";
import { LinkButton } from "@/components/ui/button";
import { cn, pad } from "@/lib/utils";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ kategorie?: string }> }): Promise<Metadata> {
  const cat = categoryBySlug((await searchParams).kategorie);
  return {
    title: cat ? `${cat.name} – Projekte & Anleitungen` : "Entdecken",
    description: cat ? `Projekte, Anleitungen und Creator rund um ${cat.name}.` : "Projekte, Anleitungen, Creator und Communities aus der DIY-Community entdecken.",
    alternates: { canonical: cat ? `/entdecken?kategorie=${cat.slug}` : "/entdecken" },
  };
}

function season() {
  const m = new Date().getMonth();
  return m >= 8 && m <= 10 ? "herbst" : m === 11 || m <= 1 ? "winter" : m <= 4 ? "fruehling" : "sommer";
}

type Collection = { id: string; slug: string; title: string; kicker: string; description: string; items: { type: string; id: string }[]; season: string | null };

/** Entdecken (§18.3): redaktionell kuratiert, nach Interessen gemischt, auch für Gäste. */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ kategorie?: string }> }) {
  const sp = await searchParams;
  const cat = categoryBySlug(sp.kategorie);
  const user = await currentUser();
  const viewerId = user?.id ?? null;
  const interests = cat ? [cat.slug] : (user?.profile?.categories ?? []);

  const [popular, fresh, tutorials, creators, communities, collectionsRaw, catCounts, posts] = await Promise.all([
    listProjects({ category: cat?.slug, sort: "popular" }, viewerId, { take: 8 }),
    listProjects({ category: cat?.slug, sort: "new" }, viewerId, { take: 4 }),
    listTutorials({ category: cat?.slug }, viewerId, { take: 3 }),
    suggestedCreators(viewerId, interests, 6),
    suggestedCommunities(viewerId, interests, 4),
    db.editorialCollection.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, take: 6 }),
    db.project.groupBy({ by: ["category"], where: { state: "PUBLISHED", visibility: "PUBLIC" }, _count: true }),
    cat ? listPosts({ ...(await baseFeedWhere(viewerId)), category: cat.slug, visibility: "PUBLIC", communityId: null }, viewerId, { take: 4 }) : Promise.resolve(null),
  ]);
  const collections = collectionsRaw as unknown as Collection[];
  const seasonal = collections.find((c) => c.season === season()) ?? null;
  const editorial = collections.filter((c) => c !== seasonal).slice(0, 2);
  const counts = new Map(catCounts.map((c) => [c.category, c._count]));
  const following = new Set(viewerId ? (await db.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } })).map((f) => f.followeeId) : []);

  const collectionCards = await Promise.all(
    [seasonal, ...editorial].filter(Boolean).map(async (c) => {
      const projectIds = c!.items.filter((i) => i.type === "project").map((i) => i.id);
      const tutorialIds = c!.items.filter((i) => i.type === "tutorial").map((i) => i.id);
      const [p, t] = await Promise.all([getProjectCards(projectIds, viewerId), getTutorialCards(tutorialIds, viewerId)]);
      return { c: c!, projects: p, tutorials: t };
    }),
  );
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl } : null;
  const viewer2 = viewer;

  return (
    <Page width="wide">
      {/* Kopf */}
      <header className="mb-10 grid gap-8 border-b border-rule pb-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />{cat ? `Werkstatt ${pad(CATEGORIES.indexOf(cat) + 1)}` : "Entdecken"}</p>
          <h1 className="display text-5xl text-balance sm:text-6xl">{cat ? cat.name : <>Was entsteht <em className="italic text-moss">gerade</em>?</>}</h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
            {cat ? `Projekte, Anleitungen und Menschen rund um ${cat.name}.` : "Projekte, Anleitungen und Menschen – kuratiert von der Redaktion und gemischt nach deinen Interessen."}
          </p>
        </div>
        {!user && (
          <div className="border border-line bg-card p-5 rounded-2xl">
            <p className="text-sm text-ink-2">Folge Creatorn, speichere Projekte und teile deine eigenen Arbeiten.</p>
            <div className="mt-4 flex gap-2">
              <LinkButton href="/registrieren">Kostenlos beitreten</LinkButton>
              <LinkButton href="/anmelden" variant="outline">Anmelden</LinkButton>
            </div>
          </div>
        )}
      </header>

      {/* Kategorien */}
      <nav aria-label="Kategorien" className="-mx-4 mb-12 flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href="/entdecken" className={cn("flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm", !cat ? "border-moss bg-moss text-paper" : "border-line hover:border-rule-strong")}>Alle</Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/entdecken?kategorie=${c.slug}`}
            aria-current={cat?.slug === c.slug ? "page" : undefined}
            className={cn("flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm", cat?.slug === c.slug ? "border-moss bg-moss text-paper" : "border-line hover:border-rule-strong")}
          >
            <Glyph name={c.glyph} size={16} strokeWidth={1.5} />
            {c.short}
            <span className="font-mono text-[10px] opacity-60">{counts.get(c.slug) ?? 0}</span>
          </Link>
        ))}
      </nav>

      <div className="space-y-20">
        <section>
          <SectionTitle n="01" title="Empfohlene Projekte" action={<Link href={`/projekte${cat ? `?kategorie=${cat.slug}` : ""}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Alle <ArrowRight size={12} /></Link>} />
          {popular.items.length ? (
            <ProjectGrid className="mt-6">{popular.items.map((p, i) => <ProjectCard key={p.id} project={p} priority={i < 4} />)}</ProjectGrid>
          ) : (
            <Empty className="mt-6" title="Noch keine Projekte hier" body="Sei die erste Person, die in dieser Werkstatt ein Projekt teilt." action={<LinkButton href="/projekte/neu">Projekt anlegen</LinkButton>} />
          )}
        </section>

        {collectionCards.map(({ c, projects, tutorials: tuts }, idx) =>
          projects.length + tuts.length === 0 ? null : (
            <section key={c.id} className={cn(idx === 0 && "border border-rule bg-card p-6 sm:p-10 rounded-2xl")}>
              <div className="grid gap-8 lg:grid-cols-[1fr_3fr]">
                <div>
                  <p className="spec text-clay">{c.kicker || "Kollektion"}</p>
                  <h2 className="display mt-3 text-4xl">{c.title}</h2>
                  {c.description && <p className="mt-3 text-sm leading-relaxed text-muted">{c.description}</p>}
                  <p className="mt-6 spec">Redaktionell kuratiert</p>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
                  {projects.slice(0, 4).map((p) => <ProjectCard key={p.id} project={p} />)}
                  {tuts.slice(0, 4 - Math.min(4, projects.length)).map((t) => <TutorialCard key={t.id} tutorial={t} className="col-span-2" />)}
                </div>
              </div>
            </section>
          ),
        )}

        {tutorials.items.length > 0 && (
          <section>
            <SectionTitle n="02" title="Aktuelle Anleitungen" action={<Link href="/anleitungen" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Alle <ArrowRight size={12} /></Link>} />
            <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{tutorials.items.map((t) => <TutorialCard key={t.id} tutorial={t} />)}</div>
          </section>
        )}

        <div className="grid gap-16 lg:grid-cols-[2fr_1fr]">
          <section>
            <SectionTitle n="03" title={cat ? "Neu in dieser Werkstatt" : "Frisch angefangen"} />
            <ProjectGrid className="mt-6 lg:grid-cols-2 xl:grid-cols-4">{fresh.items.map((p) => <ProjectCard key={p.id} project={p} ratio="1/1" />)}</ProjectGrid>
          </section>
          <section>
            <SectionTitle n="04" title="Creator entdecken" />
            <ul className="divide-y divide-line">
              {creators.map((c) => (
                <li key={c.userId} className="flex items-center gap-3 py-3">
                  <Link href={`/u/${c.handle}`}><Avatar src={c.avatarUrl} name={c.displayName} size={40} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${c.handle}`} className="block truncate text-sm font-semibold hover:underline">{c.displayName}</Link>
                    <p className="truncate text-xs text-muted">{c.bio}</p>
                  </div>
                  {viewerId && <FollowButton userId={c.userId} following={following.has(c.userId)} size="sm" className="min-w-0" />}
                </li>
              ))}
              {creators.length === 0 && <li className="py-4 text-sm text-muted">Bald mehr.</li>}
            </ul>
          </section>
        </div>

        {posts && posts.items.length > 0 && (
          <section>
            <SectionTitle n="05" title="Aus der Community" />
            <div className="max-w-[660px]">{posts.items.map((p) => <PostCard key={p.id} post={p} viewer={viewer2} />)}</div>
          </section>
        )}

        {communities.length > 0 && (
          <section>
            <SectionTitle n={posts ? "06" : "05"} title="Community-Highlights" action={<Link href="/communities" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Alle <ArrowRight size={12} /></Link>} />
            <ul className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden">
              {communities.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}`} className="flex h-full flex-col justify-between bg-paper p-5 hover:bg-card">
                    <Glyph name={categoryBySlug(c.category)?.glyph ?? "spark"} size={28} strokeWidth={1.6} />
                    <span className="mt-6 block font-semibold">{c.name}</span>
                    <span className="spec mt-1">{c.memberCount} Mitglieder · {categoryBySlug(c.category)?.short}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Page>
  );
}
