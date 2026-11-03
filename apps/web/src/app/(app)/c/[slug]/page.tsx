import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArrowUpRight, Lock, Settings, Trophy } from "lucide-react";
import { COMMUNITY_ROLE_LABEL, COMMUNITY_VISIBILITY_LABEL, PROJECT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import {
  getCommunityPage,
  listCommunityPosts,
  listCommunityProjects,
  listMembers,
  listPinnedPosts,
  shareableProjects,
  type CommunityPageData,
} from "@/server/communities/service";
import { TabLinks } from "@/components/shell/page";
import { JoinButton } from "@/components/communities/join-button";
import { CommunityComposer, CommunityFeed } from "@/components/communities/community-feed";
import { RemoveProjectButton, ShareProject } from "@/components/communities/community-manage";
import { ShareButton } from "@/components/social/actions";
import { Avatar, Badge, Difficulty, Empty, Notice, SectionTitle, Spec } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { LinkButton } from "@/components/ui/button";
import { formatDate, pluralize } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; nach?: string }> };

const load = cache(async (slug: string) => {
  const viewer = await currentUser();
  return { viewer, data: await getCommunityPage(slug, viewer) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await load(slug);
  if (!data) return { title: "Community", robots: { index: false } };
  const c = data.community;
  return {
    title: c.name,
    description: c.description.slice(0, 160) || `${c.name} – Community auf WERKRAUM`,
    alternates: { canonical: `/c/${c.slug}` },
    robots: c.visibility === "PRIVATE" ? { index: false } : undefined,
    openGraph: { title: c.name, description: c.description.slice(0, 160), images: c.coverUrl ? [{ url: c.coverUrl }] : undefined },
  };
}

const TABS = [
  { key: "beitraege", label: "Beiträge" },
  { key: "projekte", label: "Projekte" },
  { key: "mitglieder", label: "Mitglieder" },
  { key: "regeln", label: "Regeln" },
  { key: "ueber", label: "Über" },
] as const;

function ChallengeBanner({ ch }: { ch: NonNullable<CommunityPageData["challenge"]> }) {
  const running = ch.startsAt <= new Date();
  const daysLeft = Math.max(0, Math.ceil((ch.endsAt.getTime() - Date.now()) / 86400_000));
  return (
    <aside aria-label="Challenge" className="mb-8 grid gap-3 border border-clay/40 bg-clay-soft px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span className="grid size-10 place-items-center border border-clay text-clay-ink"><Trophy size={18} aria-hidden /></span>
      <div className="min-w-0">
        <p className="spec text-clay-ink">{running ? `Challenge läuft · noch ${pluralize(daysLeft, "Tag", "Tage")}` : `Challenge ab ${formatDate(ch.startsAt, { day: "numeric", month: "long" })}`}</p>
        <p className="headline mt-0.5 text-lg">{ch.title}</p>
        {ch.description && <p className="mt-1 text-sm text-ink-2">{ch.description}</p>}
      </div>
      <p className="font-mono text-[11px] text-clay-ink num">
        {formatDate(ch.startsAt, { day: "2-digit", month: "2-digit" })} – {formatDate(ch.endsAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
      </p>
    </aside>
  );
}

function RulesList({ rules }: { rules: CommunityPageData["community"]["rules"] }) {
  if (!rules.length) return <p className="text-sm text-muted">Diese Community hat noch keine eigenen Regeln. Es gelten die <Link href="/richtlinien/community" className="underline underline-offset-2">Community-Richtlinien</Link>.</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {rules.map((r, i) => (
        <li key={r.id} className="grid grid-cols-[3rem_1fr] gap-2 py-4">
          <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="font-semibold">{r.title}</p>
            {r.body && <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{r.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function CommunityPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { viewer, data } = await load(slug);
  if (!data) notFound();
  const { community: c, membership, canView, isMember, isMod, muted } = data;
  const tab = (TABS.find((t) => t.key === sp.tab) ?? TABS[0]).key;
  const viewerLite = viewer?.profile ? { id: viewer.id, displayName: viewer.profile.displayName, avatarUrl: viewer.profile.avatarUrl } : null;
  const cat = categoryBySlug(c.category);
  const base = `/c/${c.slug}`;

  let body: React.ReactNode = null;
  if (!canView) {
    body = (
      <div className="mx-auto max-w-[660px]">
        <div className="border border-line bg-card p-8 text-center">
          <Lock size={22} className="mx-auto text-muted" aria-hidden />
          <p className="headline mt-4 text-2xl">Private Community</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">Beiträge, Projekte und Mitglieder sind nur für Mitglieder sichtbar. {membership?.state === "PENDING" ? "Deine Anfrage liegt der Moderation vor." : "Stell eine Beitrittsanfrage – die Moderation entscheidet."}</p>
          <div className="mt-6 flex justify-center">
            <JoinButton communityId={c.id} slug={c.slug} visibility={c.visibility} state={(membership?.state as "PENDING" | "INVITED" | "BANNED" | undefined) ?? null} loggedIn={!!viewer} />
          </div>
        </div>
        {c.description && <p className="mt-8 whitespace-pre-line text-[15.5px] leading-relaxed text-ink-2">{c.description}</p>}
      </div>
    );
  } else if (tab === "beitraege") {
    const [pinned, posts] = await Promise.all([listPinnedPosts(c.id, viewer?.id ?? null), listCommunityPosts(c.id, viewer?.id ?? null)]);
    body = (
      <div className="mx-auto max-w-[660px]">
        {isMember && viewerLite && !muted && <CommunityComposer communityId={c.id} communityName={c.name} viewer={viewerLite} isMod={isMod} />}
        {isMember && muted && membership?.mutedUntil && (
          <Notice tone="warn" title="Du bist stummgeschaltet">Bis {formatDate(membership.mutedUntil, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} kannst du hier lesen, aber nichts veröffentlichen.</Notice>
        )}
        {!isMember && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-sunken px-4 py-3 text-sm">
            <span>{membership?.state === "PENDING" ? "Deine Beitrittsanfrage wird geprüft." : "Tritt bei, um mitzuschreiben und Projekte zu teilen."}</span>
            <JoinButton communityId={c.id} slug={c.slug} visibility={c.visibility} state={(membership?.state as "PENDING" | "INVITED" | "BANNED" | undefined) ?? null} loggedIn={!!viewer} />
          </div>
        )}
        <div className="mt-4">
          {pinned.length + posts.items.length === 0 ? (
            <Empty className="mt-6" title="Noch keine Beiträge" body={isMember ? "Mach den Anfang: Was liegt gerade auf deiner Werkbank?" : "Hier ist es noch ruhig."} />
          ) : (
            <CommunityFeed communityId={c.id} pinned={pinned} initial={posts.items} cursor={posts.nextCursor} viewer={viewerLite} isMod={isMod} />
          )}
        </div>
      </div>
    );
  } else if (tab === "projekte") {
    const [projects, options] = await Promise.all([listCommunityProjects(c.id, viewer?.id ?? null), isMember && viewer ? shareableProjects(viewer.id, c.id) : Promise.resolve([])]);
    body = (
      <div>
        {isMember && !muted && (
          <div className="mb-8 max-w-xl">
            <ShareProject communityId={c.id} options={options} />
          </div>
        )}
        {projects.length === 0 ? (
          <Empty title="Noch keine Projekte" body={isMember ? "Teile ein öffentliches Projekt – es bleibt deins, erscheint aber auch hier." : "Mitglieder können hier ihre Projekte teilen."} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="group relative flex flex-col border border-line bg-card hover:border-ink">
                <Cover url={p.coverUrl} alt="" seed={p.id} category={p.category} ratio="4/3" className="border-b border-line" sizes="(min-width: 1024px) 360px, 50vw" />
                <div className="flex flex-1 flex-col p-4">
                  <p className="spec">{PROJECT_STATUS_LABEL[p.status]} · {categoryBySlug(p.category)?.short}</p>
                  <h3 className="headline mt-1 text-[1.2rem]">
                    <Link href={p.href} className="after:absolute after:inset-0 group-hover:underline">{p.title}</Link>
                  </h3>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[13px]">
                    <span className="flex items-center gap-2">
                      <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? ""} size={22} />
                      {p.owner.profile?.displayName}
                    </span>
                    <Difficulty level={p.difficulty} />
                  </div>
                  {(isMod || p.ownerId === viewer?.id) && (
                    <div className="relative z-10 mt-3 border-t border-line pt-2 text-right">
                      <RemoveProjectButton communityId={c.id} projectId={p.id} label={p.title} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (tab === "mitglieder") {
    const res = await listMembers(c.id, { viewerId: viewer?.id ?? null, take: 60, cursor: sp.nach });
    const leads = res.items.filter((m) => m.role !== "MEMBER");
    const members = res.items.filter((m) => m.role === "MEMBER");
    const Grid = ({ list }: { list: typeof res.items }) => (
      <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <li key={m.userId} className="border-b border-line">
            <Link href={`/u/${m.handle}`} className="group flex items-center gap-3 py-3">
              <Avatar src={m.avatarUrl} name={m.displayName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold group-hover:underline">{m.displayName}</span>
                <span className="block truncate text-xs text-muted">@{m.handle}</span>
              </span>
              {m.role !== "MEMBER" && <Badge tone={m.role === "OWNER" ? "ink" : "moss"}>{COMMUNITY_ROLE_LABEL[m.role]}</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    );
    body = (
      <div className="space-y-12">
        {leads.length > 0 && (
          <section>
            <SectionTitle n="01" title="Leitung & Moderation" />
            <Grid list={leads} />
          </section>
        )}
        <section>
          <SectionTitle n={leads.length ? "02" : "01"} title="Mitglieder" action={<span className="spec">{pluralize(c.memberCount, "Mitglied", "Mitglieder")}</span>} />
          {members.length ? <Grid list={members} /> : <p className="py-4 text-sm text-muted">{sp.nach ? "Keine weiteren Mitglieder." : "Noch keine weiteren Mitglieder."}</p>}
        </section>
        {res.nextCursor && (
          <div className="flex justify-center">
            <LinkButton variant="outline" href={`${base}?tab=mitglieder&nach=${res.nextCursor}`}>Weitere Mitglieder</LinkButton>
          </div>
        )}
      </div>
    );
  } else if (tab === "regeln") {
    body = (
      <div className="mx-auto max-w-[720px]">
        <RulesList rules={c.rules} />
        <p className="mt-6 text-sm text-muted">Zusätzlich gelten die <Link href="/richtlinien/community" className="underline underline-offset-2 hover:text-ink">Community-Richtlinien</Link> von WERKRAUM. Verstösse kannst du über „Melden“ an jedem Beitrag mitteilen.</p>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle n="01" title="Worum es geht" />
          <p className="mt-5 whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{c.description || "Noch keine Beschreibung."}</p>
          <SectionTitle n="02" title="Regeln" className="mt-12" />
          <div className="mt-4"><RulesList rules={c.rules} /></div>
        </div>
        <aside aria-label="Datenblatt">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-ink pt-5">
            <Spec label="Gegründet">{formatDate(c.createdAt, { month: "long", year: "numeric" })}</Spec>
            <Spec label="Mitglieder">{c.memberCount}</Spec>
            <Spec label="Kategorie">{cat?.name ?? c.category}</Spec>
            <Spec label="Sichtbarkeit">{COMMUNITY_VISIBILITY_LABEL[c.visibility]}</Spec>
            {c.region && <Spec label="Region">{c.region}</Spec>}
            <Spec label="Projekte">{data.projectCount}</Spec>
          </dl>
          {c.owner.profile && (
            <div className="mt-8 border-t border-line pt-5">
              <p className="spec">Gegründet von</p>
              <Link href={`/u/${c.owner.profile.handle}`} className="mt-2 flex items-center gap-3 hover:underline">
                <Avatar src={c.owner.profile.avatarUrl} name={c.owner.profile.displayName} size={36} />
                <span className="font-semibold">{c.owner.profile.displayName}</span>
              </Link>
            </div>
          )}
        </aside>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <header className="border-b border-ink">
        <Cover url={c.coverUrl} alt="" seed={c.id} category={c.category} ratio="16/5" priority sizes="100vw" className="max-h-[320px] w-full border-b border-line" label={c.name} />
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6 py-6">
            <div className="min-w-0">
              <p className="spec flex flex-wrap items-center gap-2">
                <Link href={`/communities?kategorie=${c.category}`} className="hover:text-ink">{cat?.name ?? "Community"}</Link>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">{c.visibility === "PRIVATE" && <Lock size={10} aria-hidden />}{COMMUNITY_VISIBILITY_LABEL[c.visibility]}</span>
                {c.region && (<><span aria-hidden>·</span><span>{c.region}</span></>)}
              </p>
              <h1 className="display mt-2 text-[2.4rem] text-balance sm:text-5xl">{c.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="num"><strong className="font-semibold text-ink">{c.memberCount}</strong> {c.memberCount === 1 ? "Mitglied" : "Mitglieder"}</span>
                {canView && <span className="num"><strong className="font-semibold text-ink">{data.projectCount}</strong> Projekte</span>}
                {isMember && membership && membership.role !== "MEMBER" && <Badge tone="moss">{COMMUNITY_ROLE_LABEL[membership.role]}</Badge>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ShareButton url={base} title={c.name} />
              {isMod && (
                <LinkButton href={`${base}/verwalten`} variant="outline" className="relative">
                  <Settings size={15} /> Verwalten
                  {data.pendingCount > 0 && <span className="ml-1 bg-clay px-1.5 font-mono text-[10px] text-paper" aria-label={`${data.pendingCount} offene Anfragen`}>{data.pendingCount}</span>}
                </LinkButton>
              )}
              {canView && (
                <JoinButton communityId={c.id} slug={c.slug} visibility={c.visibility} state={(membership?.state as "ACTIVE" | "PENDING" | "INVITED" | "BANNED" | undefined) ?? null} isOwner={membership?.role === "OWNER"} loggedIn={!!viewer} />
              )}
            </div>
          </div>
          {canView && <TabLinks className="border-b-0" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "beitraege" ? base : `${base}?tab=${t.key}`, count: t.key === "mitglieder" ? c.memberCount : t.key === "projekte" ? data.projectCount : undefined }))} />}
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 pt-8 sm:px-6 lg:px-10">
        {canView && data.challenge && <ChallengeBanner ch={data.challenge} />}
        {membership?.state === "INVITED" && canView && (
          <Notice tone="moss" className="mb-8" title="Du wurdest eingeladen">Nimm die Einladung oben an, um mitzumachen.</Notice>
        )}
        {body}
        {canView && tab === "beitraege" && c.description && (
          <p className="mx-auto mt-12 max-w-[660px] border-t border-line pt-4 text-xs text-muted">
            <Link href={`${base}?tab=ueber`} className="inline-flex items-center gap-1 hover:text-ink">Über diese Community <ArrowUpRight size={12} /></Link>
          </p>
        )}
      </div>
    </div>
  );
}
