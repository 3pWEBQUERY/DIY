import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getMaterialAdminDetail } from "@/server/admin/catalog-settings";
import { effectiveCategories } from "@/server/categories/settings";
import { CatalogDialogButton } from "@/components/admin/catalog-editor";
import { OfferManager } from "@/components/admin/offer-manager";
import { adminListOffers } from "@/server/materials/offers";
import { DeleteEntryButton, MergeButton } from "@/components/admin/category-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { deleteCatalogAction, mergeMaterialAction, upsertCatalogAction } from "../../actions";
import { AuditHistory, BackLink, STATE_LABEL, stateTone } from "../../shared";

export const metadata: Metadata = { title: "Material" };

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/kategorien/material/${id}`);
  let d;
  try {
    d = await getMaterialAdminDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { material: m, usage } = d;
  const cats = new Map((await effectiveCategories()).map((c) => [c.slug, c.short]));
  const isAdmin = hasRole(actor, "ADMIN");
  const offers = await adminListOffers(m.id);
  const refs = m._count.projectMaterials + m._count.listItems;

  return (
    <div>
      <BackLink />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div>
          <p className="spec mb-1">Material · {m.id}</p>
          <h1 className="display text-[2.2rem]">{m.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-[12px] text-muted">{m.slug}</span>
            <Badge tone="outline">{m.category.name}</Badge>
            {m.brand && <Badge>{m.brand}</Badge>}
            {m.safetyInfo && <Badge tone="warn">Sicherheitshinweis</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CatalogDialogButton
            entity="material"
            id={m.id}
            variant="ink"
            categories={d.categories}
            initial={{ name: m.name, type: m.type, unit: m.unit, categoryId: m.categoryId, brand: m.brand ?? "", notes: m.notes, safetyInfo: m.safetyInfo }}
            action={upsertCatalogAction}
          />
          {isAdmin && (
            <MergeButton
              noun="Material"
              sourceName={m.name}
              usage={refs}
              hrefBase="/admin/kategorien/material"
              options={d.mergeTargets.map((t) => ({ value: t.id, label: t.brand ? `${t.name} · ${t.brand}` : t.name }))}
              action={mergeMaterialAction.bind(null, m.id)}
            />
          )}
          <DeleteEntryButton
            action={deleteCatalogAction.bind(null, "material", m.id)}
            redirect="/admin/kategorien"
            confirm={`„${m.name}“ löschen?${refs ? ` ${refs} Verweise werden zu Freitext (Projekte behalten ihre Einträge). Für Dubletten besser „Zusammenführen“ verwenden.` : ""}`}
          />
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="m1">
            <SectionTitle n="01" title={<span id="m1">Verwendung</span>} />
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {(
                [
                  ["In Projekten", m._count.projectMaterials],
                  ["In Einkaufslisten", m._count.listItems],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="border-l border-line pl-4">
                  <dt className="spec">{l}</dt>
                  <dd className="mt-1 text-xl font-semibold num">{num(v)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="m2">
            <SectionTitle n="02" title={<span id="m2">Projekte mit diesem Material{usage.length < m._count.projectMaterials ? ` (neueste ${usage.length})` : ""}</span>} />
            <Table className="mt-3" caption="Projekte, die dieses Material verwenden">
              <thead>
                <tr>
                  <Th>Projekt</Th>
                  <Th>Eintrag im Projekt</Th>
                  <Th>Menge</Th>
                  <Th>Kategorie</Th>
                  <Th>Status</Th>
                  <Th>Angelegt</Th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 && <EmptyRow cols={6}>Noch in keinem Projekt verwendet.</EmptyRow>}
                {usage.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Link href={`/admin/inhalte/projekte/${u.project.id}`} className="font-semibold hover:underline">{u.project.title}</Link>
                      {u.project.owner.profile && <span className="ml-1.5 text-xs text-muted">@{u.project.owner.profile.handle}</span>}
                    </Td>
                    <Td className="text-ink-2">{u.name}</Td>
                    <Td mono>{u.quantity || "–"}</Td>
                    <Td className="whitespace-nowrap">{cats.get(u.project.category) ?? u.project.category}</Td>
                    <Td><Badge tone={stateTone(u.project.state)}>{STATE_LABEL[u.project.state] ?? u.project.state}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(u.project.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="m-offers">
            <SectionTitle n="03" title={<span id="m-offers">Bezugsquellen &amp; Preise</span>} action={<Link href={`/materialien/${m.slug}`} className="spec hover:text-ink">Öffentliche Seite</Link>} />
            <div className="mt-3">
              <OfferManager materialId={m.id} unit={m.unit} offers={offers} />
            </div>
          </section>

          <section aria-labelledby="m3">
            <SectionTitle n="04" title={<span id="m3">Verlauf (Audit)</span>} />
            <AuditHistory rows={d.recentAudit} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Materialdaten">
          <section>
            <SectionTitle n="05" title="Stammdaten" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div><dt className="spec">Typ</dt><dd>{m.type}</dd></div>
              <div><dt className="spec">Einheit</dt><dd className="font-mono text-[12px]">{m.unit}</dd></div>
              <div><dt className="spec">Materialkategorie</dt><dd>{m.category.name}</dd></div>
              <div><dt className="spec">Marke</dt><dd>{m.brand || "–"}</dd></div>
              <div><dt className="spec">Angelegt</dt><dd>{dateTime(m.createdAt)}</dd></div>
            </dl>
          </section>
          <section>
            <SectionTitle n="06" title="Hinweise" />
            <div className="mt-3 space-y-3 text-[13px]">
              <p className={m.notes ? "whitespace-pre-wrap text-ink-2" : "text-muted"}>{m.notes || "Keine Hinweise."}</p>
              {m.safetyInfo && (
                <Notice tone="warn" title="Sicherheitshinweis">
                  <span className="whitespace-pre-wrap">{m.safetyInfo}</span>
                </Notice>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
