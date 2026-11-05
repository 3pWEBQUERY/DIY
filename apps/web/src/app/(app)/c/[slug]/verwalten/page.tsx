import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { hasRole } from "@/server/authz";
import { categoryOptions } from "@/server/categories/settings";
import { getCommunityPage, listByState, listChallenges, listHiddenPosts, listMembers, moderationLog, ROLE_RANK } from "@/server/communities/service";
import { Page, TabLinks } from "@/components/shell/page";
import { CommunityForm, RulesForm } from "@/components/communities/community-forms";
import { BannedList, ChallengesManager, InvitePanel, MembersManager, RequestsList } from "@/components/communities/community-manage";
import { HiddenPosts } from "@/components/communities/community-feed";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Community verwalten", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bereich?: string; q?: string }> };

export default async function ManageCommunityPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const viewer = await currentUser();
  if (!viewer?.profile) redirect(`/anmelden?weiter=/c/${slug}/verwalten`);
  const data = await getCommunityPage(slug, viewer);
  if (!data) notFound();
  if (!data.isMod) redirect(`/c/${slug}`);
  const c = data.community;
  const canManage = data.isManager;
  const rank = hasRole(viewer, "PLATFORM_MODERATOR") ? 99 : data.membership ? ROLE_RANK[data.membership.role] : 0;

  const SECTIONS = [
    ...(canManage ? [{ key: "einstellungen", label: "Einstellungen" }, { key: "regeln", label: "Regeln" }] : []),
    { key: "mitglieder", label: "Mitglieder & Rollen" },
    { key: "anfragen", label: "Anfragen", count: data.pendingCount },
    { key: "beitraege", label: "Ausgeblendet" },
    { key: "challenges", label: "Challenges" },
    { key: "protokoll", label: "Protokoll" },
  ];
  const active = SECTIONS.find((s) => s.key === sp.bereich)?.key ?? SECTIONS[0]!.key;
  const base = `/c/${c.slug}/verwalten`;
  const viewerLite = { id: viewer.id, displayName: viewer.profile.displayName, avatarUrl: viewer.profile.avatarUrl };

  let body: React.ReactNode;
  switch (active) {
    case "einstellungen":
      body = (
        <div className="max-w-[720px]">
          <CommunityForm initial={{ id: c.id, name: c.name, slug: c.slug, description: c.description, category: c.category, visibility: c.visibility, region: c.region, coverUrl: c.coverUrl }} categories={await categoryOptions(c.category)} />
        </div>
      );
      break;
    case "regeln":
      body = (
        <div className="max-w-[720px]">
          <p className="mb-6 text-sm text-muted">Regeln erscheinen im Tab „Regeln“ und unter „Über“. Halte sie kurz und konkret – sie sind die Grundlage für Moderationsentscheidungen.</p>
          <RulesForm communityId={c.id} initial={c.rules.map((r) => ({ title: r.title, body: r.body }))} />
        </div>
      );
      break;
    case "mitglieder": {
      const [members, invited, banned] = await Promise.all([listMembers(c.id, { q: sp.q, take: 100 }), listByState(c.id, "INVITED"), listByState(c.id, "BANNED")]);
      body = (
        <div className="space-y-12">
          <section>
            <SectionTitle n="01" title="Mitglieder & Rollen" />
            <form action={base} className="mt-4 flex max-w-sm gap-2">
              <input type="hidden" name="bereich" value="mitglieder" />
              <label htmlFor="mq" className="sr-only">Mitglied suchen</label>
              <input id="mq" name="q" defaultValue={sp.q} placeholder="Name oder @handle suchen" className="h-10 flex-1 border border-line-strong bg-card px-3 text-sm outline-none focus:border-moss rounded-2xl" />
              <button type="submit" className="h-10 border border-line-strong px-3 text-sm font-semibold hover:border-rule-strong rounded-2xl">Suchen</button>
            </form>
            <div className="mt-4">
              <MembersManager communityId={c.id} members={members.items} viewer={{ id: viewer.id, rank, canManageRoles: canManage, isOwner: data.membership?.role === "OWNER" }} />
            </div>
            {members.nextCursor && <p className="mt-3 text-xs text-muted">Es werden die ersten 100 Mitglieder angezeigt. Nutze die Suche, um weitere zu finden.</p>}
          </section>
          <section>
            <SectionTitle n="02" title="Einladen" />
            <div className="mt-4 max-w-xl"><InvitePanel communityId={c.id} invited={invited} /></div>
          </section>
          <section>
            <SectionTitle n="03" title="Gesperrt" />
            <div className="mt-2 max-w-xl"><BannedList communityId={c.id} banned={banned} /></div>
          </section>
        </div>
      );
      break;
    }
    case "anfragen": {
      const requests = await listByState(c.id, "PENDING");
      body = (
        <div className="max-w-[720px]">
          {c.visibility === "PUBLIC" && requests.length === 0 && <p className="mb-4 text-sm text-muted">Diese Community ist öffentlich – Beitritte erfolgen ohne Freigabe.</p>}
          <RequestsList communityId={c.id} requests={requests} />
        </div>
      );
      break;
    }
    case "beitraege": {
      const hidden = await listHiddenPosts(c.id, viewer.id);
      body = (
        <div className="max-w-[660px]">
          {hidden.length ? <HiddenPosts communityId={c.id} posts={hidden} viewer={viewerLite} /> : <Empty title="Nichts ausgeblendet" body="Ausgeblendete Beiträge erscheinen hier und können wiederhergestellt werden." />}
        </div>
      );
      break;
    }
    case "challenges": {
      const challenges = await listChallenges(c.id);
      body = <ChallengesManager communityId={c.id} challenges={challenges.map((ch) => ({ id: ch.id, title: ch.title, description: ch.description, startsAt: ch.startsAt.toISOString(), endsAt: ch.endsAt.toISOString() }))} />;
      break;
    }
    default: {
      const log = await moderationLog(c.id);
      body = log.length ? (
        <ol className="max-w-[860px] border-l border-rule">
          {log.map((e) => (
            <li key={e.id} className="relative grid gap-1 py-3 pl-6 sm:grid-cols-[9rem_1fr]">
              <span className="absolute -left-[4px] top-[1.15rem] size-[7px] rounded-full bg-ink" aria-hidden />
              <time dateTime={e.at} className="font-mono text-[11px] text-muted num">{formatDate(e.at, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
              <div className="min-w-0 text-sm">
                <p>
                  <span className="font-semibold">{e.label}</span>
                  {e.detail && e.action === "SET_ROLE" && <span className="text-muted"> → {e.detail}</span>}
                  {e.detail && e.action === "MUTE_MEMBER" && <span className="text-muted"> bis {formatDate(e.detail, { day: "numeric", month: "short" })}</span>}
                  {e.targetType !== "COMMUNITY" && <span className="text-ink-2"> · {e.target}</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {e.moderator && <Avatar name={e.moderator.displayName} size={16} />}
                  {e.moderator?.displayName ?? "System"}
                  {e.reason && <span className="text-ink-2">· „{e.reason}“</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty title="Noch keine Einträge" body="Jede Moderationsmassnahme wird hier nachvollziehbar protokolliert." />
      );
    }
  }

  return (
    <Page width="wide">
      <Link href={`/c/${c.slug}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> {c.name}
      </Link>
      <header className="mb-6">
        <p className="spec flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />Verwalten</p>
        <h1 className="display mt-2 text-4xl sm:text-5xl">{c.name}</h1>
      </header>
      <TabLinks className="mb-8" active={active} tabs={SECTIONS.map((s) => ({ key: s.key, label: s.label, href: `${base}?bereich=${s.key}`, count: "count" in s && s.count ? s.count : undefined }))} />
      {body}
    </Page>
  );
}
