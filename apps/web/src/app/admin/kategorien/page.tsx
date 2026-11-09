import Link from "next/link";
import type { Metadata } from "next";
import { adminPage } from "@/server/admin/guard";
import { hasRole } from "@/server/authz";
import { categoryCounts, listMaterialCatalog } from "@/server/admin/catalog";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/action-controls";
import { CatalogDialogButton } from "@/components/admin/catalog-editor";
import { Badge, SectionTitle } from "@/components/ui/misc";
import { Glyph } from "@/components/ui/glyphs";
import { num } from "@/components/admin/format";
import { deleteCatalogAction, upsertCatalogAction } from "./actions";

export const metadata: Metadata = { title: "Kategorien & Materialien" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await adminPage("PLATFORM_MODERATOR", "/admin/kategorien");
  const isAdmin = hasRole(actor, "ADMIN");
  const sp = await searchParams;
  const [cats, catalog] = await Promise.all([categoryCounts(), listMaterialCatalog(sp.q?.trim() || null)]);
  const categoryOptions = catalog.categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <AdminHeader n="10" title="Kategorien & Materialien" description="Die Slugs der DIY-Kategorien sind fest definiert und mit der iOS-App geteilt. Name, Reihenfolge, Startschwerpunkt und Aktiv-Status werden hier verwaltet. Die Materialdatenbank wird ebenfalls hier gepflegt." />

      <section aria-labelledby="c1" className="mb-12">
        <SectionTitle n="01" title={<span id="c1">DIY-Kategorien</span>} action={<span className="spec">{cats.filter((c) => c.isActive).length} von {cats.length} aktiv · Slugs fix{isAdmin ? "" : " · Ändern: Administration"}</span>} />
        <Table className="mt-3" caption="DIY-Kategorien mit Anzahl veröffentlichter Inhalte">
          <thead>
            <tr>
              <Th>Kategorie</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th align="right">Projekte</Th>
              <Th align="right">Anleitungen</Th>
              <Th align="right">Beiträge</Th>
              <Th align="right">Produkte</Th>
              <Th align="right">Communities</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <Tr key={c.slug} className={c.isActive ? undefined : "text-muted"}>
                <Td>
                  <Link href={`/admin/kategorien/${c.slug}`} className="group flex items-center gap-2.5">
                    <span className="font-mono text-[11px] text-muted num">{String(c.position).padStart(2, "0")}</span>
                    <Glyph name={c.glyph} size={20} className={c.isActive ? "text-ink" : "text-muted"} />
                    <span className="min-w-0">
                      <span className="block font-semibold group-hover:underline">{c.name}</span>
                      {c.name !== c.defaults.name && <span className="block text-xs text-muted">Standard: {c.defaults.name}</span>}
                    </span>
                    {c.focus && <Badge tone="moss">Startschwerpunkt</Badge>}
                    {c.overridden && <Badge tone="outline">Angepasst</Badge>}
                  </Link>
                </Td>
                <Td mono className="text-muted">{c.slug}</Td>
                <Td>{c.isActive ? <Badge tone="moss">Aktiv</Badge> : <Badge>Inaktiv</Badge>}</Td>
                <Td align="right">{num(c.projects)}</Td>
                <Td align="right">{num(c.tutorials)}</Td>
                <Td align="right">{num(c.posts)}</Td>
                <Td align="right">{num(c.products)}</Td>
                <Td align="right">{num(c.communities)}</Td>
                <Td align="right">
                  <Link href={`/admin/kategorien/${c.slug}`} className="text-[13px] font-semibold text-moss hover:underline">
                    Verwalten
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="c2" className="mb-12">
        <SectionTitle n="02" title={<span id="c2">Materialkategorien</span>} action={<CatalogDialogButton entity="materialCategory" action={upsertCatalogAction} />} />
        <ul className="mt-3 grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.categories.length === 0 && <li className="py-4 text-sm text-muted">Noch keine Kategorien.</li>}
          {catalog.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
              <span className="text-sm">
                <span className="font-semibold">{c.name}</span> <span className="font-mono text-[11px] text-muted">{c._count.materials}</span>
              </span>
              <span className="flex gap-1">
                <CatalogDialogButton entity="materialCategory" id={c.id} initial={{ name: c.name }} action={upsertCatalogAction} />
                {c._count.materials === 0 && <ActionButton action={deleteCatalogAction.bind(null, "materialCategory", c.id)} label="Löschen" variant="ghost" confirm={`Kategorie „${c.name}“ löschen?`} />}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <FilterBar>
        <FilterField label="Material oder Werkzeug suchen">
          <input name="q" defaultValue={sp.q ?? ""} className={`${filterInput} w-64`} />
        </FilterField>
      </FilterBar>

      <section aria-labelledby="c3" className="mb-12">
        <SectionTitle
          n="03"
          title={<span id="c3">Materialien ({catalog.materials.length})</span>}
          action={categoryOptions.length ? <CatalogDialogButton entity="material" categories={categoryOptions} action={upsertCatalogAction} /> : <span className="text-xs text-muted">Zuerst eine Kategorie anlegen</span>}
        />
        <Table className="mt-3" caption="Materialien">
          <thead>
            <tr>
              <Th>Material</Th>
              <Th>Typ</Th>
              <Th>Kategorie</Th>
              <Th>Einheit</Th>
              <Th>Sicherheit</Th>
              <Th align="right">Verwendet</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {catalog.materials.length === 0 && <EmptyRow cols={7}>Keine Materialien.</EmptyRow>}
            {catalog.materials.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <Link href={`/admin/kategorien/material/${m.id}`} className="font-semibold hover:underline">
                    {m.name}
                  </Link>
                  {m.brand && <span className="ml-1.5 text-xs text-muted">{m.brand}</span>}
                </Td>
                <Td>{m.type}</Td>
                <Td>{m.category.name}</Td>
                <Td mono>{m.unit}</Td>
                <Td>{m.safetyInfo ? <Badge tone="warn">Hinweis</Badge> : <span className="text-muted">–</span>}</Td>
                <Td align="right">{num(m._count.projectMaterials)}</Td>
                <Td>
                  <span className="flex justify-end gap-1">
                    <CatalogDialogButton
                      entity="material"
                      id={m.id}
                      categories={categoryOptions}
                      initial={{ name: m.name, type: m.type, unit: m.unit, categoryId: m.categoryId, brand: m.brand ?? "", notes: m.notes, safetyInfo: m.safetyInfo }}
                      action={upsertCatalogAction}
                    />
                    <ActionButton action={deleteCatalogAction.bind(null, "material", m.id)} label="Löschen" variant="ghost" confirm={`„${m.name}“ löschen? Das geht nur, solange kein Projekt, Bestand oder Bezugsquelle darauf verweist – Dubletten bitte zusammenführen.`} />
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="c4">
        <SectionTitle n="04" title={<span id="c4">Werkzeuge ({catalog.tools.length})</span>} action={<CatalogDialogButton entity="tool" action={upsertCatalogAction} />} />
        <Table className="mt-3" caption="Werkzeuge">
          <thead>
            <tr>
              <Th>Werkzeug</Th>
              <Th>Hinweise</Th>
              <Th>Sicherheit</Th>
              <Th align="right">Verwendet</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {catalog.tools.length === 0 && <EmptyRow cols={5}>Keine Werkzeuge.</EmptyRow>}
            {catalog.tools.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <Link href={`/admin/kategorien/werkzeug/${t.id}`} className="font-semibold hover:underline">
                    {t.name}
                  </Link>
                </Td>
                <Td className="max-w-[320px] text-ink-2"><span className="line-clamp-1">{t.notes || "–"}</span></Td>
                <Td>{t.safetyInfo ? <Badge tone="warn">Hinweis</Badge> : <span className="text-muted">–</span>}</Td>
                <Td align="right">{num(t._count.projectTools)}</Td>
                <Td>
                  <span className="flex justify-end gap-1">
                    <CatalogDialogButton entity="tool" id={t.id} initial={{ name: t.name, notes: t.notes, safetyInfo: t.safetyInfo }} action={upsertCatalogAction} />
                    <ActionButton action={deleteCatalogAction.bind(null, "tool", t.id)} label="Löschen" variant="ghost" confirm={`„${t.name}“ löschen?`} />
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
