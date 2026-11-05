import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, VISIBILITY, categoryBySlug, listCategories } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getPostDetail } from "@/server/admin/content-detail";
import { EditContentButton } from "@/components/admin/content-admin";
import { dateTime, num } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { AuditSection, CasesSection, CommentsSection, DetailHeader, Facts, MetaList, Mono, POST_KIND_LABEL, Preview, STATE_LABEL, StatGrid, StateActions, VISIBILITY_SHORT, stateTone } from "../../_components/detail";

export const metadata: Metadata = { title: "Beitrag verwalten" };

export default async function AdminPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/inhalte/beitraege/${id}`);
  let d;
  try {
    d = await getPostDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { post: p, ctx } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const title = p.body.trim() ? (p.body.trim().length > 70 ? `${p.body.trim().slice(0, 70)} …` : p.body.trim()) : `${POST_KIND_LABEL[p.kind] ?? "Beitrag"} ohne Text`;
  const thumbs = p.media.map((m) => {
    const v = (m.media.variants ?? {}) as Record<string, string>;
    return { src: v.sm ?? v.md ?? null, alt: m.alt, kind: m.media.kind };
  });
  const linked: [string, string, string][] = [
    ...(p.project ? [["Projekt", p.project.title, `/admin/inhalte/projekte/${p.project.id}`] as [string, string, string]] : []),
    ...(p.tutorial ? [["Anleitung", p.tutorial.title, `/admin/inhalte/anleitungen/${p.tutorial.id}`] as [string, string, string]] : []),
    ...(p.article ? [["Artikel", p.article.title, `/admin/inhalte/artikel/${p.article.id}`] as [string, string, string]] : []),
    ...(p.repostOf ? [["Weitergeteilt von", p.repostOf.body.slice(0, 60) || "Beitrag", `/admin/inhalte/beitraege/${p.repostOf.id}`] as [string, string, string]] : []),
    ...(p.community ? [["Community", p.community.name, `/c/${p.community.slug}`] as [string, string, string]] : []),
  ];

  return (
    <div>
      <DetailHeader
        backHref="/admin/inhalte?typ=beitraege"
        backLabel="Alle Beiträge"
        spec={`Beitrag · ${POST_KIND_LABEL[p.kind] ?? p.kind} · ${p.id}`}
        title={title}
        coverUrl={thumbs.find((t) => t.src)?.src}
        author={p.author}
        publicHref={p.state !== "REMOVED" ? `/beitrag/${p.id}` : null}
        badges={
          <>
            <Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state]}</Badge>
            <Badge tone="outline">{VISIBILITY_SHORT[p.visibility]}</Badge>
            {p.reachLimited && <Badge tone="warn">Reichweite beschränkt</Badge>}
            {p.isCommercial && <Badge tone="clay">Werbung</Badge>}
            {p.isPinned && <Badge>Angeheftet</Badge>}
          </>
        }
        actions={
          <>
            {p.state !== "REMOVED" && (
              <EditContentButton
                kind="POST"
                id={p.id}
                values={{ category: p.category, visibility: p.visibility }}
                categories={listCategories().map((c) => ({ value: c.slug, label: c.short + (c.isActive ? "" : " (inaktiv)") }))}
                visibilities={VISIBILITY.map((v) => ({ value: v, label: VISIBILITY_SHORT[v] ?? v }))}
              />
            )}
            <StateActions kind="POST" id={p.id} state={p.state} canFeature={null} canRemove isAdmin={isAdmin} />
          </>
        }
      />

      {p.state === "REMOVED" && (
        <Notice tone="danger" className="mb-8" title="Beitrag entfernt">
          Der Beitrag ist für niemanden mehr sichtbar. {isAdmin ? "Wiederherstellen ist möglich." : "Wiederherstellen kann nur die Administration."}
        </Notice>
      )}
      {p.state === "HIDDEN" && (
        <Notice tone="warn" className="mb-8" title="Beitrag ausgeblendet">
          Nur die Person selbst sieht den Beitrag.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="b1">
            <SectionTitle n="01" title={<span id="b1">Kennzahlen</span>} />
            <StatGrid
              items={[
                ["Gefällt", p.likeCount],
                ["Kommentare", p.commentCount],
                ["Gemerkt", p.saveCount],
                ["Weitergeteilt", p.repostCount],
                ["Medien", p.media.length],
                ["Ausgeblendete Komm.", ctx.commentStats.hidden + ctx.commentStats.removed],
                ["Meldungen", ctx.reportCount],
                ["Fälle", ctx.cases.length],
              ]}
            />
          </section>

          <section aria-labelledby="b2">
            <SectionTitle n="02" title={<span id="b2">Inhalt</span>} />
            <Preview
              text={p.body}
              limit={5000}
              footer={
                <Facts
                  items={[
                    ["Art", POST_KIND_LABEL[p.kind] ?? p.kind],
                    ["Kategorie", categoryBySlug(p.category)?.short ?? p.category ?? "–"],
                    ["Sichtbarkeit", VISIBILITY_SHORT[p.visibility]],
                    ["Medien", num(p.media.length)],
                    ["Ankündigung", p.isAnnouncement ? "ja" : "nein"],
                  ]}
                />
              }
            />
            {thumbs.some((t) => t.src) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {thumbs.map((t, i) =>
                  t.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={t.src} alt={t.alt || `Medium ${i + 1}`} className="size-20 rounded-xl border border-line object-cover" />
                  ) : (
                    <span key={i} className="grid size-20 place-items-center rounded-xl border border-line bg-sunken font-mono text-[11px] text-muted">
                      {t.kind}
                    </span>
                  ),
                )}
              </div>
            )}
            {linked.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-[13px]">
                {linked.map(([l, v, href]) => (
                  <li key={l} className="flex gap-3">
                    <span className="spec w-36 shrink-0">{l}</span>
                    <Link href={href} className="min-w-0 truncate hover:underline">
                      {v}
                    </Link>
                  </li>
                ))}
              </ul>
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
                ["Autor:in", <Link key="a" href={`/admin/nutzer/${p.author.id}`} className="hover:underline">{p.author.profile?.displayName ?? "–"} · <Mono>{p.author.id}</Mono></Link>],
                ["Kategorie", categoryBySlug(p.category)?.name ?? p.category ?? "–"],
                ["Community", p.community ? <Link key="c" href={`/c/${p.community.slug}`} target="_blank" className="hover:underline">{p.community.name}</Link> : "–"],
                ["Produkt", p.product?.title ?? "–"],
                ["Qualitätswert", p.qualityScore.toFixed(2)],
                ["Veröffentlicht", dateTime(p.publishedAt)],
                ["Bearbeitet", dateTime(p.editedAt)],
                ["Erstellt", dateTime(p.createdAt)],
                ["Aktualisiert", dateTime(p.updatedAt)],
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
