import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, Link2, MessageSquare, Store, BookOpen, Settings } from "lucide-react";
import { categoryBySlug, formatMoney, type Currency } from "@werkraum/shared";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { isBlockedBetween, relationsFor } from "@/server/visibility";
import { listProjects } from "@/server/projects/service";
import { listTutorials } from "@/server/tutorials/service";
import { listPosts, baseFeedWhere } from "@/server/social/posts";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard } from "@/components/tutorials/tutorial-card";
import { PostCard } from "@/components/social/post-card";
import { FollowButton, ShareButton } from "@/components/social/actions";
import { ProfileSafetyMenu } from "./profile-menu";
import { TrackView } from "@/components/analytics/track-view";
import { Avatar, Badge, Empty } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { Glyph } from "@/components/ui/glyphs";
import { LinkButton } from "@/components/ui/button";
import { TabLinks } from "@/components/shell/page";
import { cn, formatDate, compactNumber } from "@/lib/utils";

type Params = { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> };

async function load(handle: string) {
  const profile = await db.userProfile.findUnique({
    where: { handle: handle.toLowerCase() },
    include: { user: { select: { id: true, status: true, createdAt: true, role: true, shop: { select: { slug: true, name: true, status: true, tagline: true } } } } },
  });
  if (!profile) {
    const r = await db.handleRedirect.findUnique({ where: { oldHandle: handle.toLowerCase() }, include: { profile: { select: { handle: true } } } });
    if (r) permanentRedirect(`/u/${r.profile.handle}`);
    return null;
  }
  if (profile.user.status === "DELETED" || profile.user.status === "BANNED") return null;
  return profile;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const p = await load(handle);
  if (!p) return { title: "Profil nicht gefunden" };
  return {
    title: `${p.displayName} (@${p.handle})`,
    description: p.bio || `${p.displayName} auf WERKRAUM – Projekte, Anleitungen und mehr.`,
    alternates: { canonical: `/u/${p.handle}` },
    openGraph: { type: "profile", images: p.avatarUrl ? [p.avatarUrl] : undefined },
  };
}

const TAB_KEYS = ["beitraege", "projekte", "anleitungen", "shop", "sammlungen", "ueber"] as const;
type Tab = (typeof TAB_KEYS)[number];

/** Creator-Profil (UI-04, PRD §12). Nicht genutzte Bereiche werden ausgeblendet. */
export default async function ProfilePage({ params, searchParams }: Params) {
  const { handle } = await params;
  const sp = await searchParams;
  const profile = await load(handle);
  if (!profile) notFound();
  const viewer = await currentUser();
  const viewerId = viewer?.id ?? null;
  const userId = profile.userId;
  const isSelf = viewerId === userId;
  const blocked = viewerId && !isSelf ? await isBlockedBetween(viewerId, userId) : false;

  const rel = await relationsFor(viewerId);
  const following = rel.following.includes(userId);
  const muted = rel.muted.includes(userId);

  const base = await baseFeedWhere(viewerId, { includeMuted: true });
  const [projects, tutorials, posts, products, collections, articles, followsYou] = blocked
    ? [null, null, null, [], [], 0, false]
    : await Promise.all([
        listProjects({ ownerId: userId, sort: "updated" }, viewerId, { take: 24 }),
        listTutorials({ authorId: userId }, viewerId, { take: 12 }),
        listPosts({ ...base, authorId: userId, communityId: null }, viewerId, { take: 12 }),
        profile.user.shop?.status === "ACTIVE"
          ? db.product.findMany({ where: { shop: { ownerId: userId }, status: { in: ["ACTIVE", "SOLD_OUT"] } }, orderBy: { publishedAt: "desc" }, take: 12, select: { id: true, slug: true, title: true, priceMinor: true, currency: true, coverUrl: true, category: true, status: true } })
          : Promise.resolve([]),
        db.collection.findMany({ where: { ownerId: userId, ...(isSelf ? {} : { visibility: "PUBLIC" }) }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { items: true } } } }),
        db.blogArticle.count({ where: { authorId: userId, state: "PUBLISHED" } }),
        viewerId && !isSelf ? db.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: viewerId } } }).then(Boolean) : Promise.resolve(false),
      ]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "beitraege" as Tab, label: "Beiträge", count: profile.postCount },
    { key: "projekte" as Tab, label: "Projekte", count: projects?.items.length ?? 0 },
    ...(tutorials?.items.length ? [{ key: "anleitungen" as Tab, label: "Anleitungen", count: tutorials.items.length }] : []),
    ...(products.length ? [{ key: "shop" as Tab, label: "Shop", count: products.length }] : []),
    ...(collections.length ? [{ key: "sammlungen" as Tab, label: "Sammlungen", count: collections.length }] : []),
    { key: "ueber" as Tab, label: "Über mich" },
  ];
  const requested = TAB_KEYS.includes(sp.tab as Tab) ? (sp.tab as Tab) : null;
  const tab: Tab = requested && tabs.some((t) => t.key === requested) ? requested : (projects?.items.length ?? 0) > 0 && !requested ? "projekte" : "beitraege";
  const links = (Array.isArray(profile.links) ? profile.links : []) as { label?: string; url: string }[];
  const viewerSlim = viewer?.profile ? { id: viewer.id, displayName: viewer.profile.displayName, avatarUrl: viewer.profile.avatarUrl } : null;

  const stats = [
    ["Follower", profile.followerCount],
    ["Folgt", profile.followingCount],
    ["Projekte", profile.projectCount],
    ["Beiträge", profile.postCount],
  ] as const;

  return (
    <div>
      {!isSelf && !blocked && <TrackView targetType="USER" targetId={userId} />}
      {/* Titelbild: Foto oder Rasterpapier mit den Werkstatt-Glyphen */}
      <div className="relative h-44 overflow-hidden border-b border-ink bg-sunken sm:h-64">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid-paper flex h-full items-center justify-end gap-10 overflow-hidden px-10 text-ink/80" aria-hidden>
            {profile.categories.slice(0, 3).map((c, i) => (
              <Glyph key={c} name={categoryBySlug(c)?.glyph ?? "spark"} size={i === 0 ? 150 : 96} strokeWidth={1.2} className={cn(i === 0 && "text-moss")} />
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-10">
        <header className="relative grid gap-6 border-b border-line pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar src={profile.avatarUrl} name={profile.displayName} size={128} ring className="-mt-14 border border-ink sm:-mt-16 rounded-2xl" />
            <div className="min-w-0 pb-1 sm:pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display text-4xl sm:text-5xl">{profile.displayName}</h1>
                {profile.user.role !== "MEMBER" && <Badge tone="moss">Team</Badge>}
                {profile.user.shop?.status === "ACTIVE" && <Badge tone="clay">Verkäufer:in</Badge>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span>@{profile.handle}</span>
                {followsYou && <span className="bg-sunken px-1.5 text-xs rounded-2xl">folgt dir</span>}
                {profile.region && (
                  <span className="inline-flex items-center gap-1"><MapPin size={13} />{profile.region}</span>
                )}
                {profile.pronouns && <span>{profile.pronouns}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSelf ? (
              <>
                <LinkButton href="/einstellungen/profil" variant="outline" size="sm"><Settings size={14} /> Profil bearbeiten</LinkButton>
                <LinkButton href="/studio" variant="ink" size="sm">Creator Studio</LinkButton>
              </>
            ) : viewer && !blocked ? (
              <>
                <FollowButton userId={userId} following={following} />
                {profile.dmPolicy !== "NOBODY" && (
                  <LinkButton href={`/nachrichten/neu?an=${profile.handle}`} variant="outline"><MessageSquare size={15} /> Nachricht</LinkButton>
                )}
              </>
            ) : !viewer ? (
              <LinkButton href={`/anmelden?weiter=/u/${profile.handle}`} variant="ink">Folgen</LinkButton>
            ) : null}
            <span className="grid size-10 place-items-center border border-line-strong rounded-xl"><ShareButton url={`/u/${profile.handle}`} title={`${profile.displayName} auf WERKRAUM`} /></span>
            {viewer && !isSelf && <ProfileSafetyMenu userId={userId} name={profile.displayName} blocked={!!blocked && false} muted={muted} />}
          </div>
        </header>

        {blocked ? (
          <Empty className="my-16" title="Dieses Profil ist nicht verfügbar" body="Zwischen euch besteht eine Blockierung. Blockierungen kannst du in den Einstellungen unter Privatsphäre verwalten." />
        ) : (
          <div className="grid gap-10 py-8 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0">
              <TabLinks active={tab} tabs={tabs.map((t) => ({ ...t, href: `/u/${profile.handle}?tab=${t.key}` }))} />
              <div className="mt-6">
                {tab === "beitraege" &&
                  (posts?.items.length ? (
                    <div className="max-w-[660px]">{posts.items.map((p) => <PostCard key={p.id} post={p} viewer={viewerSlim} />)}</div>
                  ) : (
                    <Empty title="Noch keine Beiträge" body={isSelf ? "Teile, woran du gerade arbeitest." : `${profile.displayName} hat noch nichts geteilt.`} action={isSelf ? <LinkButton href="/erstellen">Beitrag erstellen</LinkButton> : undefined} />
                  ))}
                {tab === "projekte" &&
                  (projects?.items.length ? (
                    <ProjectGrid className="lg:grid-cols-3">{projects.items.map((p, i) => <ProjectCard key={p.id} project={p} showAuthor={false} priority={i < 3} />)}</ProjectGrid>
                  ) : (
                    <Empty title="Noch keine Projekte" action={isSelf ? <LinkButton href="/projekte/neu">Erstes Projekt anlegen</LinkButton> : undefined} />
                  ))}
                {tab === "anleitungen" && tutorials && <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">{tutorials.items.map((t) => <TutorialCard key={t.id} tutorial={t} showAuthor={false} />)}</div>}
                {tab === "shop" && profile.user.shop && (
                  <div>
                    <div className="mb-6 flex items-center justify-between border border-line bg-card px-5 py-4 rounded-2xl">
                      <div>
                        <p className="spec">Shop</p>
                        <p className="font-semibold">{profile.user.shop.name}</p>
                        {profile.user.shop.tagline && <p className="text-sm text-muted">{profile.user.shop.tagline}</p>}
                      </div>
                      <LinkButton href={`/markt/${profile.user.shop.slug}`} variant="outline" size="sm"><Store size={14} /> Zum Shop</LinkButton>
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
                      {products.map((p) => (
                        <Link key={p.id} href={`/markt/${profile.user.shop!.slug}/${p.slug}`} className="group">
                          <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="4/5" />
                          <p className="mt-2 text-sm font-semibold group-hover:underline">{p.title}</p>
                          <p className="font-mono text-xs text-muted">{p.status === "SOLD_OUT" ? "Ausverkauft" : formatMoney(p.priceMinor, p.currency as Currency)}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {tab === "sammlungen" && (
                  <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 rounded-2xl overflow-hidden">
                    {collections.map((c) => (
                      <li key={c.id}>
                        <Link href={`/sammlungen/${c.id}`} className="block bg-paper p-5 hover:bg-card">
                          <p className="headline text-xl">{c.title}</p>
                          <p className="spec mt-1">{c._count.items} Einträge · {c.visibility === "PUBLIC" ? "Öffentlich" : "Privat"}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "ueber" && (
                  <div className="max-w-xl space-y-6">
                    <p className="prose-werk whitespace-pre-line">{profile.bio || "Noch keine Biografie."}</p>
                    <dl className="grid grid-cols-2 gap-6 border-t border-line pt-6">
                      <div><dt className="spec">Mitglied seit</dt><dd className="mt-1 font-semibold">{formatDate(profile.user.createdAt, { month: "long", year: "numeric" })}</dd></div>
                      {profile.region && <div><dt className="spec">Region</dt><dd className="mt-1 font-semibold">{profile.region}</dd></div>}
                    </dl>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-8" aria-label="Profilinformationen">
              <dl className="grid grid-cols-4 border-y border-ink py-4 lg:grid-cols-2 lg:gap-y-5">
                {stats.map(([l, v]) => (
                  <div key={l}>
                    <dt className="spec">{l}</dt>
                    <dd className="mt-1 font-mono text-xl num">{compactNumber(v)}</dd>
                  </div>
                ))}
              </dl>
              {profile.bio && tab !== "ueber" && <p className="text-[15px] leading-relaxed text-ink-2 whitespace-pre-line">{profile.bio}</p>}
              {profile.categories.length > 0 && (
                <div>
                  <p className="spec mb-2">Werkstätten</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {profile.categories.map((c) => {
                      const cat = categoryBySlug(c);
                      return cat ? (
                        <li key={c}>
                          <Link href={`/entdecken?kategorie=${c}`} className="inline-flex h-8 items-center gap-1.5 border border-line px-2.5 text-[13px] hover:border-ink rounded-xl">
                            <Glyph name={cat.glyph} size={14} strokeWidth={1.5} />{cat.short}
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
              {(links.length > 0 || profile.website) && (
                <ul className="space-y-1.5 text-sm">
                  {[...(profile.website ? [{ url: profile.website, label: profile.website.replace(/^https?:\/\//, "") }] : []), ...links].slice(0, 5).map((l) => (
                    <li key={l.url}>
                      <a href={l.url} rel="me nofollow noopener" target="_blank" className="inline-flex items-center gap-1.5 text-moss hover:underline">
                        <Link2 size={13} />{l.label || l.url.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {articles > 0 && (
                <Link href={`/u/${profile.handle}/blog`} className="flex items-center justify-between border border-line px-4 py-3 text-sm hover:border-ink rounded-2xl">
                  <span className="inline-flex items-center gap-2"><BookOpen size={15} /> Blog</span>
                  <span className="font-mono text-xs text-muted">{articles} Artikel</span>
                </Link>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
