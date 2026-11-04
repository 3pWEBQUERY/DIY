import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VISIBILITY_LABEL } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { SAVED_LABEL, getCollectionPage, type SavedItems } from "@/server/collections/service";
import { Page } from "@/components/shell/page";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { PostCard } from "@/components/social/post-card";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard, TutorialGrid } from "@/components/tutorials/tutorial-card";
import { ArticleMiniCard, ProductMiniCard } from "@/components/projects/linked-cards";
import { EditCollectionButtons } from "@/components/saved/collection-controls";
import { formatDate, pad } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const user = await currentUser();
  const c = await getCollectionPage(id, user?.id ?? null);
  if (!c) return { title: "Sammlung nicht gefunden", robots: { index: false } };
  return {
    title: `${c.title} – Sammlung von ${c.owner.displayName}`,
    description: c.description || `${c.total} gespeicherte Projekte, Anleitungen und Beiträge, kuratiert von ${c.owner.displayName}.`,
    robots: c.visibility === "PUBLIC" ? undefined : { index: false },
    alternates: { canonical: `/sammlungen/${c.id}` },
  };
}

export default async function CollectionPage({ params }: Params) {
  const { id } = await params;
  const user = await currentUser();
  const c = await getCollectionPage(id, user?.id ?? null);
  if (!c) notFound();
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl } : null;

  return (
    <Page width="wide">
      <header className="mb-12 border-b border-rule pb-8">
        <p className="spec flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Sammlung · {VISIBILITY_LABEL[c.visibility]} · {c.total} {c.total === 1 ? "Eintrag" : "Einträge"}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="display text-[2.6rem] text-balance sm:text-6xl">{c.title}</h1>
          {c.isOwner && <EditCollectionButtons collection={{ id: c.id, title: c.title, description: c.description, visibility: c.visibility }} />}
        </div>
        {c.description && <p className="mt-4 max-w-[60ch] font-serif text-[1.2rem] leading-relaxed text-ink-2">{c.description}</p>}
        <Link href={`/u/${c.owner.handle}`} className="mt-6 inline-flex items-center gap-2.5 text-sm text-muted hover:text-ink">
          <Avatar src={c.owner.avatarUrl} name={c.owner.displayName} size={28} />
          <span>
            Kuratiert von <span className="font-semibold text-ink">{c.owner.displayName}</span> · {formatDate(c.updatedAt, { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </Link>
      </header>

      {c.sections.length ? (
        <div className="space-y-16">
          {c.sections.map((s, i) => (
            <section key={s.type} aria-label={SAVED_LABEL[s.type]}>
              <SectionTitle n={pad(i + 1)} title={SAVED_LABEL[s.type]} action={<span className="spec">{s.items.length}</span>} />
              <div className="mt-8">
                <Section content={s} viewer={viewer} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="Diese Sammlung ist noch leer" body={c.isOwner ? "Speichere Inhalte und ordne sie unter «Gespeichert» dieser Sammlung zu." : undefined} action={c.isOwner ? <Link href="/gespeichert" className="font-semibold underline underline-offset-2">Zu «Gespeichert»</Link> : undefined} />
      )}
    </Page>
  );
}

function Section({ content, viewer }: { content: SavedItems; viewer: { id: string; displayName: string; avatarUrl: string | null } | null }) {
  switch (content.type) {
    case "POST":
      return <div className="max-w-[660px]">{content.items.map((p) => <PostCard key={p.id} post={p} viewer={viewer} />)}</div>;
    case "PROJECT":
      return <ProjectGrid>{content.items.map((p) => <ProjectCard key={p.id} project={p} />)}</ProjectGrid>;
    case "TUTORIAL":
      return <TutorialGrid>{content.items.map((t) => <TutorialCard key={t.id} tutorial={t} />)}</TutorialGrid>;
    case "PRODUCT":
      return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{content.items.map((p) => <ProductMiniCard key={p.id} product={p} />)}</div>;
    case "ARTICLE":
      return <div className="max-w-[760px]">{content.items.map((a) => <ArticleMiniCard key={a.id} article={a} />)}</div>;
  }
}
