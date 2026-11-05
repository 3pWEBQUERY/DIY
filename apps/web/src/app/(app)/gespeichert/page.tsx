import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowUpRight, ListChecks } from "lucide-react";
import { VISIBILITY_LABEL } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { SAVED_LABEL, SAVED_TYPES, listCollections, listSaved, type SavedItems, type SavedType } from "@/server/collections/service";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { Empty } from "@/components/ui/misc";
import { PostCard } from "@/components/social/post-card";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard, TutorialGrid } from "@/components/tutorials/tutorial-card";
import { ArticleMiniCard, ProductMiniCard } from "@/components/projects/linked-cards";
import { EditCollectionButtons, NewCollectionButton, SavedItemControls } from "@/components/saved/collection-controls";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { AddToShoppingList } from "@/components/materials/add-to-list";

export const metadata: Metadata = { title: "Gespeichert", robots: { index: false } };

const PARAM: Record<SavedType, string> = { POST: "beitraege", PROJECT: "projekte", TUTORIAL: "anleitungen", PRODUCT: "produkte", ARTICLE: "artikel" };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ typ?: string; sammlung?: string; seite?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/gespeichert");
  const collections = await listCollections(user.id);
  const activeCollection = sp.sammlung && sp.sammlung !== "ohne" ? collections.find((c) => c.id === sp.sammlung) : undefined;
  const collectionParam = activeCollection ? activeCollection.id : sp.sammlung === "ohne" ? "ohne" : undefined;
  const requested = (Object.entries(PARAM).find(([, v]) => v === sp.typ)?.[0] as SavedType | undefined) ?? undefined;
  const page = Math.max(1, Number(sp.seite) || 1);

  // Ohne explizite Auswahl: erster Typ mit Inhalten
  let type: SavedType = requested ?? "PROJECT";
  let data = await listSaved(user, { type, collectionId: collectionParam ?? null, page });
  if (!requested && data.counts[type] === 0) {
    const first = SAVED_TYPES.find((t) => data.counts[t] > 0);
    if (first && first !== type) {
      type = first;
      data = await listSaved(user, { type, collectionId: collectionParam ?? null, page });
    }
  }
  const total = SAVED_TYPES.reduce((a, t) => a + data.counts[t], 0);
  // Materialanzahl je gespeichertem Projekt/Anleitung → „Auf Einkaufsliste“ (§17.4)
  const itemIds = data.content.type === "PROJECT" || data.content.type === "TUTORIAL" ? data.content.items.map((i) => i.id) : [];
  const materialCounts = new Map<string, number>();
  if (data.content.type === "PROJECT" && itemIds.length) {
    const rows = await db.projectMaterial.groupBy({ by: ["projectId"], where: { projectId: { in: itemIds } }, _count: { _all: true } });
    rows.forEach((r) => materialCounts.set(r.projectId, r._count._all));
  } else if (data.content.type === "TUTORIAL" && itemIds.length) {
    const rows = await db.tutorial.findMany({ where: { id: { in: itemIds } }, select: { id: true, currentVersion: { select: { materials: true } } } });
    rows.forEach((r) => materialCounts.set(r.id, Array.isArray(r.currentVersion?.materials) ? r.currentVersion.materials.length : 0));
  }
  const listCount = await db.shoppingList.count({ where: { ownerId: user.id } });
  const viewer = { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl };
  const options = collections.map((c) => ({ id: c.id, title: c.title }));
  const q = (patch: Record<string, string | undefined>) => {
    const next = { typ: PARAM[type], sammlung: collectionParam, ...patch };
    const s = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString();
    return `/gespeichert${s ? `?${s}` : ""}`;
  };
  const controls = (id: string, title?: string) => (
    <>
      <SavedItemControls type={type} id={id} collectionId={data.meta[id]?.collectionId ?? null} collections={options} />
      {(type === "PROJECT" || type === "TUTORIAL") && (materialCounts.get(id) ?? 0) > 0 && (
        <div className="mt-2">
          <AddToShoppingList kind={type} id={id} title={title ?? ""} count={materialCounts.get(id)!} signedIn className="w-full" />
        </div>
      )}
    </>
  );

  return (
    <Page width="wide">
      <PageHeader
        kicker={activeCollection ? `Sammlung · ${VISIBILITY_LABEL[activeCollection.visibility]}` : "Werkbank"}
        title={activeCollection ? activeCollection.title : sp.sammlung === "ohne" ? "Ohne Sammlung" : "Gespeichert"}
        description={activeCollection?.description || "Alles, was du dir gemerkt hast – ordne es in Sammlungen, privat oder öffentlich."}
        actions={
          activeCollection ? (
            <div className="flex items-center gap-2">
              {activeCollection.visibility !== "PRIVATE" && (
                <Link href={`/sammlungen/${activeCollection.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline">
                  Ansicht <ArrowUpRight size={13} />
                </Link>
              )}
              <EditCollectionButtons collection={activeCollection} />
            </div>
          ) : (
            <Link href="/einkaufslisten" className="inline-flex h-10 items-center gap-2 border border-line-strong bg-card px-4 text-sm font-semibold hover:border-rule-strong rounded-xl">
              <ListChecks size={16} /> Einkaufslisten
              <span className="font-mono text-[11px] text-muted">{listCount}</span>
            </Link>
          )
        }
      />

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Sammlungen" className="lg:sticky lg:top-10 lg:h-fit">
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <p className="spec text-ink">Sammlungen</p>
            <span className="spec">{collections.length}</span>
          </div>
          <ul className="mt-1 flex gap-1 overflow-x-auto scrollbar-none lg:block">
            {[
              { id: undefined as string | undefined, title: "Alles", count: null as number | null, vis: null as string | null },
              { id: "ohne", title: "Ohne Sammlung", count: null, vis: null },
              ...collections.map((c) => ({ id: c.id, title: c.title, count: c.count, vis: c.visibility })),
            ].map((c) => {
              const active = (collectionParam ?? undefined) === c.id;
              return (
                <li key={c.id ?? "all"} className="shrink-0">
                  <Link
                    href={c.id ? `/gespeichert?sammlung=${c.id}` : "/gespeichert"}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors", active ? "bg-moss font-semibold text-paper" : "text-ink-2 hover:bg-sunken")}
                  >
                    <span className="truncate">{c.title}</span>
                    <span className={cn("shrink-0 font-mono text-[10px]", active ? "text-paper/70" : "text-muted")}>
                      {c.vis && c.vis !== "PRIVATE" ? "↗ " : ""}
                      {c.count ?? ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <NewCollectionButton className="mt-3 px-2" />
        </nav>

        <div className="min-w-0">
          <TabLinks active={type} tabs={SAVED_TYPES.map((t) => ({ key: t, label: SAVED_LABEL[t], count: data.counts[t], href: q({ typ: PARAM[t], seite: undefined }) }))} />
          <div className="mt-8">
            {data.content.items.length ? (
              <SavedContent content={data.content} viewer={viewer} controls={controls} />
            ) : (
              <Empty
                title={total === 0 ? "Noch nichts gespeichert" : `Keine ${SAVED_LABEL[type]}`}
                body={total === 0 ? "Tippe auf das Lesezeichen bei Beiträgen, Projekten, Anleitungen, Produkten oder Artikeln – sie landen hier." : "In dieser Ansicht gibt es keine Inhalte dieses Typs."}
                action={total === 0 ? <Link href="/entdecken" className="font-semibold underline underline-offset-2">Entdecken</Link> : undefined}
              />
            )}
            {data.unavailable > 0 && (
              <p className="mt-8 text-[13px] text-muted">{data.unavailable === 1 ? "Ein gespeicherter Inhalt ist" : `${data.unavailable} gespeicherte Inhalte sind`} nicht mehr verfügbar (gelöscht oder nicht mehr sichtbar).</p>
            )}
            {(data.hasMore || data.page > 1) && (
              <div className="mt-10 flex justify-between gap-3">
                {data.page > 1 ? <Link href={q({ seite: String(data.page - 1) })} className="border border-line px-4 py-2 text-sm font-semibold hover:border-rule-strong rounded-2xl">Zurück</Link> : <span />}
                {data.hasMore && <Link href={q({ seite: String(data.page + 1) })} className="border border-line px-4 py-2 text-sm font-semibold hover:border-rule-strong rounded-2xl">Weitere</Link>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

function SavedContent({ content, viewer, controls }: { content: SavedItems; viewer: { id: string; displayName: string; avatarUrl: string | null }; controls: (id: string, title?: string) => React.ReactNode }) {
  switch (content.type) {
    case "POST":
      return (
        <div className="max-w-[660px]">
          {content.items.map((p) => (
            <div key={p.id}>
              <PostCard post={p} viewer={viewer} />
              <div className="-mt-3 mb-4 max-w-xs">{controls(p.id)}</div>
            </div>
          ))}
        </div>
      );
    case "PROJECT":
      return (
        <ProjectGrid className="lg:grid-cols-3">
          {content.items.map((p) => (
            <ProjectCard key={p.id} project={p} footer={controls(p.id, p.title)} />
          ))}
        </ProjectGrid>
      );
    case "TUTORIAL":
      return (
        <TutorialGrid>
          {content.items.map((t) => (
            <TutorialCard key={t.id} tutorial={t} footer={controls(t.id, t.title)} />
          ))}
        </TutorialGrid>
      );
    case "PRODUCT":
      return (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
          {content.items.map((p) => (
            <div key={p.id}>
              <ProductMiniCard product={p} />
              {controls(p.id)}
            </div>
          ))}
        </div>
      );
    case "ARTICLE":
      return (
        <div className="max-w-[760px]">
          {content.items.map((a) => (
            <div key={a.id} className="pb-2">
              <ArticleMiniCard article={a} />
              <div className="max-w-xs">{controls(a.id)}</div>
            </div>
          ))}
        </div>
      );
  }
}
