import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, DIFFICULTY, DIFFICULTY_LABEL, SAFETY_LABEL, categoryBySlug, type SafetyKind } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getTutorialDetail } from "@/server/admin/content-detail";
import { EditContentButton } from "@/components/admin/content-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { AuditSection, CasesSection, CommentsSection, DetailHeader, Facts, MetaList, Mono, Preview, STATE_LABEL, StatGrid, StateActions, stateTone } from "../../_components/detail";

export const metadata: Metadata = { title: "Anleitung verwalten" };

const safety = (k: string) => SAFETY_LABEL[k as SafetyKind] ?? k;

export default async function AdminTutorialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/inhalte/anleitungen/${id}`);
  let d;
  try {
    d = await getTutorialDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { tutorial: t, ctx } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const steps = t.currentVersion?.steps ?? [];
  const stepSafety = steps.filter((s) => s.safety || s.safetyKinds.length).length;
  const started = t._count.progress;

  return (
    <div>
      <DetailHeader
        backHref="/admin/inhalte?typ=anleitungen"
        backLabel="Alle Anleitungen"
        spec={`Anleitung · ${t.id}`}
        title={t.title}
        coverUrl={t.coverUrl}
        author={t.author}
        publicHref={t.state !== "REMOVED" ? `/anleitungen/${t.slug}` : null}
        badges={
          <>
            <Badge tone={stateTone(t.state)}>{STATE_LABEL[t.state]}</Badge>
            {t.isPaid && <Badge tone="outline">Kostenpflichtig</Badge>}
            {t.isFeatured && <Badge tone="clay">Hervorgehoben</Badge>}
            {t.safetyKinds.length > 0 && <Badge tone="warn">{t.safetyKinds.length} Sicherheitshinweise</Badge>}
          </>
        }
        actions={
          <>
            {t.state !== "REMOVED" && (
              <EditContentButton
                kind="TUTORIAL"
                id={t.id}
                values={{ title: t.title, summary: t.summary, category: t.category, difficulty: t.difficulty }}
                categories={CATEGORIES.map((c) => ({ value: c.slug, label: c.short }))}
                difficulties={DIFFICULTY.map((n) => ({ value: String(n), label: DIFFICULTY_LABEL[n] ?? String(n) }))}
              />
            )}
            <StateActions kind="TUTORIAL" id={t.id} state={t.state} featured={t.isFeatured} canFeature canRemove isAdmin={isAdmin} />
          </>
        }
      />

      {t.state === "REMOVED" && (
        <Notice tone="danger" className="mb-8" title="Anleitung entfernt">
          Die Anleitung ist für niemanden mehr sichtbar. {isAdmin ? "Wiederherstellen ist möglich." : "Wiederherstellen kann nur die Administration."}
        </Notice>
      )}
      {t.state === "HIDDEN" && (
        <Notice tone="warn" className="mb-8" title="Anleitung ausgeblendet">
          Nur die Person selbst sieht die Anleitung.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="t1">
            <SectionTitle n="01" title={<span id="t1">Kennzahlen</span>} />
            <StatGrid
              items={[
                ["Aufrufe", t.viewCount],
                ["Gefällt", t.likeCount],
                ["Gemerkt", t.saveCount],
                ["Begonnen", started],
                ["Abgeschlossen", t.completionCount, started ? `${Math.round((t.completionCount / started) * 100)} % der Begonnenen` : undefined],
                ["Kommentare", ctx.commentStats.published],
                ["Meldungen", ctx.reportCount],
                ["Fälle", ctx.cases.length],
              ]}
            />
          </section>

          <section aria-labelledby="t2">
            <SectionTitle n="02" title={<span id="t2">Inhalt</span>} />
            <Preview
              text={t.summary}
              empty="Keine Zusammenfassung."
              footer={
                <Facts
                  items={[
                    ["Niveau", DIFFICULTY_LABEL[t.difficulty] ?? t.difficulty],
                    ["Dauer", t.minutes ? `${num(t.minutes)} Min.` : "–"],
                    ["Versionen", num(t._count.versions)],
                    ["Schritte (aktuell)", num(steps.length)],
                    ["Schritte mit Warnung", num(stepSafety)],
                    ["Medien", num(t._count.media)],
                    ["Dateien", num(t._count.assets)],
                    ["Produkte", num(t._count.products)],
                  ]}
                />
              }
            />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="spec mr-1">Sicherheit</span>
              {t.safetyKinds.length ? t.safetyKinds.map((k) => <Badge key={k} tone="warn">{safety(k)}</Badge>) : <span className="text-[13px] text-muted">Keine Hinweise</span>}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="spec mb-2">Schritte · Version {t.currentVersion?.version ?? "–"}</p>
                {steps.length ? (
                  <ol className="divide-y divide-line border-y border-line text-[13px]">
                    {steps.map((s) => (
                      <li key={s.id} className="flex items-baseline gap-3 py-2">
                        <span className="w-6 shrink-0 font-mono text-muted">{s.position + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        {(s.safety || s.safetyKinds.length > 0) && (
                          <span title={[s.safetyKinds.map(safety).join(", "), s.safety].filter(Boolean).join(" – ")}>
                            <Badge tone="warn">Warnung</Badge>
                          </span>
                        )}
                        {s.minutes != null && <span className="shrink-0 text-muted">{s.minutes} Min.</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted">Noch keine veröffentlichte Version.</p>
                )}
              </div>
              <div>
                <p className="spec mb-2">Versionen</p>
                <Table caption="Versionen">
                  <thead>
                    <tr>
                      <Th>Version</Th>
                      <Th>Notiz</Th>
                      <Th align="right">Schritte</Th>
                      <Th>Datum</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.versions.length === 0 && <EmptyRow cols={4}>Keine Versionen.</EmptyRow>}
                    {t.versions.map((v) => (
                      <Tr key={v.id} highlight={v.id === t.currentVersionId}>
                        <Td mono>
                          v{v.version}
                          {v.isMajor && <span className="ml-1.5 text-clay-ink">gross</span>}
                        </Td>
                        <Td className="max-w-[200px] truncate text-ink-2">{v.changeNote || "–"}</Td>
                        <Td align="right">{num(v._count.steps)}</Td>
                        <Td className="whitespace-nowrap text-muted">{shortDate(v.publishedAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
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
                ["ID", <Mono key="id">{t.id}</Mono>],
                ["Slug", <Mono key="slug">{t.slug}</Mono>],
                ["Autor:in", <Link key="a" href={`/admin/nutzer/${t.author.id}`} className="hover:underline">{t.author.profile?.displayName ?? "–"} · <Mono>{t.author.id}</Mono></Link>],
                ["Kategorie", categoryBySlug(t.category)?.name ?? t.category],
                ["Sprache", t.language],
                ["Preis", t.isPaid ? (t.priceMinor != null ? `${(t.priceMinor / 100).toFixed(2)} CHF` : "kostenpflichtig") : "kostenlos"],
                ["Projekt", t.project ? <Link key="p" href={`/admin/inhalte/projekte/${t.project.id}`} className="hover:underline">{t.project.title}</Link> : "–"],
                ["Aktuelle Version", t.currentVersion ? `v${t.currentVersion.version} · ${shortDate(t.currentVersion.publishedAt)}` : "–"],
                ["Beiträge im Feed", num(t._count.posts)],
                ["Qualitätswert", t.qualityScore.toFixed(2)],
                ["Erstellt", dateTime(t.createdAt)],
                ["Veröffentlicht", dateTime(t.publishedAt)],
                ["Aktualisiert", dateTime(t.updatedAt)],
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
