import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, VISIBILITY, categoryBySlug } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getProjectDetail } from "@/server/admin/content-detail";
import { EditContentButton } from "@/components/admin/content-admin";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { AuditSection, CasesSection, CommentsSection, DetailHeader, Facts, MetaList, Mono, Preview, STATE_LABEL, StatGrid, StateActions, VISIBILITY_SHORT, stateTone } from "../../_components/detail";

export const metadata: Metadata = { title: "Projekt verwalten" };

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/inhalte/projekte/${id}`);
  let d;
  try {
    d = await getProjectDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { project: p, ctx } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const publicHref = p.state !== "REMOVED" && p.owner.profile?.handle ? `/u/${p.owner.profile.handle}/${p.slug}` : null;

  return (
    <div>
      <DetailHeader
        backHref="/admin/inhalte?typ=projekte"
        backLabel="Alle Projekte"
        spec={`Projekt · ${p.id}`}
        title={p.title}
        coverUrl={p.coverUrl}
        author={p.owner}
        publicHref={publicHref}
        badges={
          <>
            <Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state]}</Badge>
            <Badge tone="outline">{VISIBILITY_SHORT[p.visibility]}</Badge>
            {p.isFeatured && <Badge tone="clay">Hervorgehoben</Badge>}
          </>
        }
        actions={
          <>
            {p.state !== "REMOVED" && (
              <EditContentButton
                kind="PROJECT"
                id={p.id}
                values={{ title: p.title, summary: p.description, category: p.category, visibility: p.visibility }}
                categories={CATEGORIES.map((c) => ({ value: c.slug, label: c.short }))}
                visibilities={VISIBILITY.map((v) => ({ value: v, label: VISIBILITY_SHORT[v] ?? v }))}
              />
            )}
            <StateActions kind="PROJECT" id={p.id} state={p.state} featured={p.isFeatured} canFeature={p.visibility === "PUBLIC"} canRemove isAdmin={isAdmin} />
          </>
        }
      />

      {p.state === "REMOVED" && (
        <Notice tone="danger" className="mb-8" title="Projekt entfernt">
          Das Projekt ist für niemanden mehr sichtbar. {isAdmin ? "Wiederherstellen ist möglich." : "Wiederherstellen kann nur die Administration."}
        </Notice>
      )}
      {p.state === "HIDDEN" && (
        <Notice tone="warn" className="mb-8" title="Projekt ausgeblendet">
          Nur die Person selbst sieht das Projekt.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="p1">
            <SectionTitle n="01" title={<span id="p1">Kennzahlen</span>} />
            <StatGrid
              items={[
                ["Aufrufe", p.viewCount],
                ["Gefällt", p.likeCount],
                ["Gemerkt", p.saveCount],
                ["Nachbauten", p.remixCount],
                ["Kommentare", p.commentCount],
                ["Follower", p._count.followers],
                ["Meldungen", ctx.reportCount],
                ["Fälle", ctx.cases.length],
              ]}
            />
          </section>

          <section aria-labelledby="p2">
            <SectionTitle n="02" title={<span id="p2">Inhalt</span>} />
            <Preview
              text={p.description}
              empty="Keine Beschreibung."
              footer={
                <Facts
                  items={[
                    ["Status", PROJECT_STATUS_LABEL[p.status]],
                    ["Niveau", DIFFICULTY_LABEL[p.difficulty] ?? p.difficulty],
                    ["Medien", num(p._count.media)],
                    ["Material", num(p._count.materials)],
                    ["Werkzeuge", num(p._count.tools)],
                    ["Journal", num(p._count.updates)],
                    ["Anleitungen", num(p._count.tutorials)],
                    ["Beiträge", num(p._count.posts)],
                    ["Produkte", num(p._count.products)],
                    ["Communities", num(p._count.communityProjects)],
                    ["Mitwirkende", num(p._count.contributors)],
                  ]}
                />
              }
            />
            {p.tags.length > 0 && <p className="mt-3 text-[13px] text-ink-2">{p.tags.map((t) => `#${t}`).join(" ")}</p>}
            {p.remixNote && <p className="mt-2 text-[13px] text-muted">Nachbau-Hinweis: {p.remixNote}</p>}
            {p.outgoing.length > 0 && (
              <p className="mt-2 text-[13px] text-muted">
                Bezieht sich auf:{" "}
                {p.outgoing.map((o, i) => (
                  <span key={o.to.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/inhalte/projekte/${o.to.id}`} className="text-ink hover:underline">
                      {o.to.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {p.updates.length > 0 && (
              <div className="mt-5">
                <p className="spec mb-2">Letzte Journal-Einträge</p>
                <ol className="divide-y divide-line border-y border-line text-[13px]">
                  {p.updates.map((u) => (
                    <li key={u.id} className="flex gap-4 py-2">
                      <span className="w-20 shrink-0 text-muted">{shortDate(u.happenedAt)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {u.milestone && <strong className="mr-1.5">{u.milestone}</strong>}
                        {u.body}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <CommentsSection n="03" ctx={ctx} isAdmin={isAdmin} />
          <CasesSection n="04" ctx={ctx} />
          <AuditSection n="05" ctx={ctx} />
        </div>

        <aside className="space-y-8" aria-label="Stammdaten">
          <section>
            <SectionTitle n="06" title="Stammdaten" />
            <MetaList
              items={[
                ["ID", <Mono key="id">{p.id}</Mono>],
                ["Slug", <Mono key="slug">{p.slug}</Mono>],
                ["Autor:in", <Link key="a" href={`/admin/nutzer/${p.owner.id}`} className="hover:underline">{p.owner.profile?.displayName ?? "–"} · <Mono>{p.owner.id}</Mono></Link>],
                ["Kategorie", categoryBySlug(p.category)?.name ?? p.category],
                ["Unterkategorien", p.subcategories.length ? p.subcategories.join(", ") : "–"],
                ["Sichtbarkeit", VISIBILITY_SHORT[p.visibility]],
                ["Zeitaufwand", p.actualMinutes ? `${num(p.actualMinutes)} Min. (geplant ${num(p.estimatedMinutes)})` : p.estimatedMinutes ? `geplant ${num(p.estimatedMinutes)} Min.` : "–"],
                ["Budget", p.budgetMinor != null ? `${(p.budgetMinor / 100).toFixed(2)} ${p.currency}` : "–"],
                ["Qualitätswert", p.qualityScore.toFixed(2)],
                ["Erstellt", dateTime(p.createdAt)],
                ["Veröffentlicht", dateTime(p.publishedAt)],
                ["Abgeschlossen", dateTime(p.completedAt)],
                ["Aktualisiert", dateTime(p.updatedAt)],
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
