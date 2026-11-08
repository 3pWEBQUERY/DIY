import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Bookmark, Plus, Sparkles, Users } from "lucide-react";
import { PROJECT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { categoryOptions } from "@/server/categories/settings";
import { getFeed, type FeedKind } from "@/server/social/posts";
import { suggestedCreators, suggestedCommunities, activeProjectsOf, trendingProjects } from "@/server/discovery/suggestions";
import { relationsFor } from "@/server/visibility";
import { Page, TabLinks } from "@/components/shell/page";
import { Composer } from "@/components/social/composer";
import { FeedList } from "@/components/social/feed-list";
import { FollowButton } from "@/components/social/actions";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { Plate } from "@/components/ui/media";
import { LinkButton } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Startseite" };

const TABS: { key: FeedKind; label: string; param: string }[] = [
  { key: "for-you", label: "Für dich", param: "fuer-dich" },
  { key: "following", label: "Folge ich", param: "folge-ich" },
  { key: "new", label: "Neu", param: "neu" },
];

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ ansicht?: string; tipp?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/entdecken");
  if (!user.onboardedAt && sp.tipp !== "aus") redirect("/willkommen");
  const tab = TABS.find((t) => t.param === sp.ansicht) ?? TABS[0]!;
  const interests = user.profile?.categories ?? [];
  const viewer = { id: user.id, displayName: user.profile?.displayName ?? "", avatarUrl: user.profile?.avatarUrl ?? null };

  const [feed, myProjects, creators, communities, trending, rel] = await Promise.all([
    getFeed(tab.key, { id: user.id, interests }, null),
    activeProjectsOf(user.id),
    suggestedCreators(user.id, interests, 4),
    suggestedCommunities(user.id, interests, 3),
    trendingProjects(3),
    relationsFor(user.id),
  ]);
  const projectOptions = await db.project.findMany({ where: { ownerId: user.id, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } });
  const isNew = rel.following.length === 0;

  const aside = (
    <div className="space-y-10">
      <section>
        <SectionTitle icon={<Avatar src={viewer.avatarUrl} name={viewer.displayName || user.profile?.handle || "Du"} size={28} />} title="Auf deiner Werkbank" action={<Link href="/erstellen?typ=projekt" className="text-muted hover:text-ink" aria-label="Neues Projekt"><Plus size={16} /></Link>} />
        {myProjects.length ? (
          <ul className="divide-y divide-line">
            {myProjects.map((p) => (
              <li key={p.id}>
                <Link href={`/u/${user.profile?.handle}/${p.slug}`} className="flex items-center gap-3 py-3 group">
                  <div className="relative size-12 shrink-0 overflow-hidden border border-line rounded-2xl">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <Plate seed={p.id} category={p.category} number={false} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold group-hover:underline">{p.title}</p>
                    <p className="spec">{PROJECT_STATUS_LABEL[p.status]} · {p._count.updates} Einträge · {relativeTime(p.updatedAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted">Noch kein Projekt in Arbeit. <Link href="/erstellen?typ=projekt" className="font-semibold text-ink underline underline-offset-2">Jetzt starten</Link></p>
        )}
      </section>

      {creators.length > 0 && (
        <section>
          <SectionTitle icon={<span className="grid size-7 place-items-center rounded-full bg-moss-soft text-moss"><Sparkles size={14} strokeWidth={2} aria-hidden /></span>} title="Creator für dich" />
          <ul className="divide-y divide-line">
            {creators.map((c) => (
              <li key={c.userId} className="flex items-center gap-3 py-3">
                <Link aria-label={`Profil von ${c.displayName}`} href={`/u/${c.handle}`}><Avatar src={c.avatarUrl} name={c.displayName} size={38} /></Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${c.handle}`} className="block truncate text-sm font-semibold hover:underline">{c.displayName}</Link>
                  <p className="truncate text-xs text-muted">{c.categories.map((s) => categoryBySlug(s)?.short).filter(Boolean).slice(0, 2).join(" · ")} · {c.projectCount} Projekte</p>
                </div>
                <FollowButton userId={c.userId} following={false} size="sm" className="min-w-0" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <SectionTitle icon={<span className="grid size-7 place-items-center rounded-full bg-moss-soft text-moss"><Bookmark size={14} strokeWidth={2} aria-hidden /></span>} title="Gerade viel gemerkt" />
          <ol className="mt-1">
            {trending.map((p, i) => (
              <li key={p.id}>
                <Link href={`/u/${p.owner.profile?.handle}/${p.slug}`} className="group flex gap-3 py-2.5">
                  <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:underline">{p.title}</span>
                    <span className="block text-xs text-muted">von {p.owner.profile?.displayName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {communities.length > 0 && (
        <section>
          <SectionTitle icon={<span className="grid size-7 place-items-center rounded-full bg-moss-soft text-moss"><Users size={14} strokeWidth={2} aria-hidden /></span>} title="Communities" action={<Link href="/communities" className="text-xs text-muted hover:text-ink">Alle</Link>} />
          <ul className="divide-y divide-line">
            {communities.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="flex items-center justify-between py-3 text-sm hover:underline">
                  <span className="font-semibold">{c.name}</span>
                  <span className="spec">{c.memberCount} Mitgl.</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Dein Feed mischt Frische, deine Interessen und Vielfalt – nicht nur Reichweite.{" "}
        <Link href="/einstellungen/feed" className="underline underline-offset-2 hover:text-ink">Anpassen</Link>
      </p>
    </div>
  );

  return (
    <Page aside={aside}>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="spec">{new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="display mt-1 text-4xl">Grüezi, {user.profile?.displayName.split(" ")[0]}.</h1>
        </div>
      </div>

      <Composer viewer={viewer} projects={projectOptions} categories={await categoryOptions()} compact />

      <TabLinks
        className="mt-8"
        active={tab.key}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/feed?ansicht=${t.param}` }))}
      />

      {isNew && tab.key !== "new" && (
        <div className="mt-6 flex items-center justify-between gap-4 border border-moss/30 bg-moss-soft px-4 py-3 text-sm rounded-2xl">
          <span>Folge ein paar Creatorn, damit dein Feed persönlicher wird.</span>
          <Link href="/entdecken" className="inline-flex shrink-0 items-center gap-1 font-semibold text-moss-ink">
            Entdecken <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <div className="mt-2">
        {feed.items.length ? (
          <FeedList kind={tab.key} initial={feed.items} cursor={feed.nextCursor} viewer={viewer} />
        ) : (
          <Empty
            className="mt-8"
            title={tab.key === "following" ? "Noch ruhig hier" : "Noch keine Beiträge"}
            body={tab.key === "following" ? "Sobald Menschen, denen du folgst, etwas teilen, erscheint es hier – chronologisch." : "Sei die erste Person, die heute etwas teilt."}
            action={<LinkButton href="/entdecken" variant="outline">Creator entdecken</LinkButton>}
          />
        )}
      </div>
    </Page>
  );
}
