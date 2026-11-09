import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getArticleDetail } from "@/server/admin/content-detail";
import { ReasonButton } from "@/components/admin/action-controls";
import { EditContentButton } from "@/components/admin/content-admin";
import { dateTime, num } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { setCommentsLockedAction } from "../../actions";
import { AuditSection, CasesSection, CommentsSection, DetailHeader, Facts, MetaList, Mono, Preview, STATE_LABEL, StatGrid, StateActions, stateTone } from "../../_components/detail";

export const metadata: Metadata = { title: "Artikel verwalten" };

export default async function AdminArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/inhalte/artikel/${id}`);
  let d;
  try {
    d = await getArticleDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { article: a, categories, ctx } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const handle = a.author.profile?.handle;
  const words = a.plainText.split(/\s+/).filter(Boolean).length;

  return (
    <div>
      <DetailHeader
        backHref="/admin/inhalte?typ=artikel"
        backLabel="Alle Artikel"
        spec={`Artikel · ${a.id}`}
        title={a.title}
        coverUrl={a.coverUrl}
        author={a.author}
        publicHref={handle && a.state === "PUBLISHED" ? `/u/${handle}/blog/${a.slug}` : null}
        badges={
          <>
            <Badge tone={stateTone(a.state)}>{STATE_LABEL[a.state]}</Badge>
            {a.isFeatured && <Badge tone="clay">Hervorgehoben</Badge>}
            {a.commentsLockedAt ? <Badge tone="outline">Kommentare gesperrt</Badge> : !a.commentsEnabled && <Badge tone="outline">Kommentare aus</Badge>}
          </>
        }
        actions={
          <>
            <EditContentButton
              kind="ARTICLE"
              id={a.id}
              values={{ title: a.title, summary: a.dek, categoryId: a.categoryId }}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            {!a.commentsLockedAt ? (
              <ReasonButton
                action={setCommentsLockedAction.bind(null, a.id, true)}
                label="Kommentare sperren"
                variant="outline"
                title="Kommentare sperren"
                description="Neue Kommentare sind danach nicht mehr möglich. Bestehende Kommentare bleiben sichtbar."
                confirmLabel="Sperren"
              />
            ) : (
              <ReasonButton action={setCommentsLockedAction.bind(null, a.id, false)} label="Kommentare öffnen" variant="outline" title="Kommentare wieder öffnen" confirmLabel="Öffnen" />
            )}
            <StateActions kind="ARTICLE" id={a.id} state={a.state} featured={a.isFeatured} canFeature canRemove isAdmin={isAdmin} />
          </>
        }
      />

      {a.state === "HIDDEN" && (
        <Notice tone="warn" className="mb-8" title="Artikel ausgeblendet">
          Nur die Person selbst sieht den Artikel. Artikel kennen keinen Zustand „entfernt“ – Ausblenden ist die stärkste Massnahme.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="r1">
            <SectionTitle n="01" title={<span id="r1">Kennzahlen</span>} />
            <StatGrid
              items={[
                ["Aufrufe", a.viewCount],
                ["Gefällt", a.likeCount],
                ["Kommentare", ctx.commentStats.published],
                ["Revisionen", a._count.revisions],
                ["Lesezeit (Min.)", a.readingMinutes],
                ["Wörter", words],
                ["Meldungen", ctx.reportCount],
                ["Fälle", ctx.cases.length],
              ]}
            />
          </section>

          <section aria-labelledby="r2">
            <SectionTitle n="02" title={<span id="r2">Inhalt</span>} />
            {a.dek && <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink">{a.dek}</p>}
            <Preview
              text={a.plainText}
              limit={1800}
              footer={
                <Facts
                  items={[
                    ["Rubrik", a.category?.name ?? "–"],
                    ["Verknüpfte Projekte", num(a._count.projects)],
                    ["Feed-Beiträge", num(a._count.posts)],
                    ["Frühere Slugs", num(a._count.slugHistory)],
                  ]}
                />
              }
            />
            {a.tags.length > 0 && <p className="mt-3 text-[13px] text-ink-2">{a.tags.map((t) => `#${t}`).join(" ")}</p>}
            {a.projects.length > 0 && (
              <p className="mt-2 text-[13px] text-muted">
                Projekte:{" "}
                {a.projects.map((p, i) => (
                  <span key={p.project.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/inhalte/projekte/${p.project.id}`} className="text-ink hover:underline">
                      {p.project.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {(a.seoTitle || a.seoDescription) && (
              <div className="mt-4 rounded-2xl border border-line bg-sunken/50 px-4 py-3 text-[13px]">
                <p className="spec mb-1">Suchmaschinen</p>
                {a.seoTitle && <p className="font-semibold">{a.seoTitle}</p>}
                {a.seoDescription && <p className="text-ink-2">{a.seoDescription}</p>}
              </div>
            )}
          </section>

          <CommentsSection
            n="03"
            ctx={ctx}
            isAdmin={isAdmin}
            note={(a.commentsLockedAt || !a.commentsEnabled) && <p className="mt-1 text-[13px] text-clay-ink">{a.commentsLockedAt ? "Neue Kommentare sind für diesen Artikel gesperrt." : "Die Autorin/der Autor hat Kommentare für diesen Artikel ausgeschaltet."}</p>}
          />
          <CasesSection n="04" ctx={ctx} />
          <AuditSection n="05" ctx={ctx} />
        </div>

        <aside className="space-y-8" aria-label="Stammdaten">
          <section>
            <SectionTitle n="06" title="Stammdaten" />
            <MetaList
              items={[
                ["ID", <Mono key="id">{a.id}</Mono>],
                ["Slug", <Mono key="slug">{a.slug}</Mono>],
                ["Autor:in", <Link key="a" href={`/admin/nutzer/${a.author.id}`} className="hover:underline">{a.author.profile?.displayName ?? "–"} · <Mono>{a.author.id}</Mono></Link>],
                ["Rubrik", a.category?.name ?? "–"],
                ["Kommentare", a.commentsLockedAt ? `gesperrt seit ${dateTime(a.commentsLockedAt)}` : a.commentsEnabled ? "offen" : "von der Autorin/dem Autor ausgeschaltet"],
                ["Erstellt", dateTime(a.createdAt)],
                ["Veröffentlicht", a.state === "SCHEDULED" ? `geplant für ${dateTime(a.publishedAt)}` : dateTime(a.publishedAt)],
                ["Aktualisiert", dateTime(a.updatedAt)],
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
