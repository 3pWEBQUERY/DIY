import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getToolAdminDetail } from "@/server/admin/catalog-settings";
import { effectiveCategories } from "@/server/categories/settings";
import { CatalogDialogButton } from "@/components/admin/catalog-editor";
import { DeleteEntryButton, MergeButton } from "@/components/admin/category-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { deleteCatalogAction, mergeToolAction, upsertCatalogAction } from "../../actions";
import { AuditHistory, BackLink, STATE_LABEL, stateTone } from "../../shared";

export const metadata: Metadata = { title: "Werkzeug" };

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/kategorien/werkzeug/${id}`);
  let d;
  try {
    d = await getToolAdminDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { tool: t, usage } = d;
  const cats = new Map((await effectiveCategories()).map((c) => [c.slug, c.short]));
  const isAdmin = hasRole(actor, "ADMIN");
  const refs = t._count.projectTools;

  return (
    <div>
      <BackLink />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div>
          <p className="spec mb-1">Werkzeug · {t.id}</p>
          <h1 className="display text-[2.2rem]">{t.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-[12px] text-muted">{t.slug}</span>
            {t.safetyInfo && <Badge tone="warn">Sicherheitshinweis</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CatalogDialogButton entity="tool" id={t.id} variant="ink" initial={{ name: t.name, notes: t.notes, safetyInfo: t.safetyInfo }} action={upsertCatalogAction} />
          {isAdmin && (
            <MergeButton
              noun="Werkzeug"
              sourceName={t.name}
              usage={refs}
              hrefBase="/admin/kategorien/werkzeug"
              options={d.mergeTargets.map((x) => ({ value: x.id, label: x.name }))}
              action={mergeToolAction.bind(null, t.id)}
            />
          )}
          <DeleteEntryButton
            action={deleteCatalogAction.bind(null, "tool", t.id)}
            redirect="/admin/kategorien"
            confirm={`„${t.name}“ löschen?${refs ? ` ${refs} Verweise werden zu Freitext (Projekte behalten ihre Einträge). Für Dubletten besser „Zusammenführen“ verwenden.` : ""}`}
          />
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="w1">
            <SectionTitle n="01" title={<span id="w1">Verwendung</span>} />
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <div className="border-l border-line pl-4">
                <dt className="spec">In Projekten</dt>
                <dd className="mt-1 text-xl font-semibold num">{num(refs)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="w2">
            <SectionTitle n="02" title={<span id="w2">Projekte mit diesem Werkzeug{usage.length < refs ? ` (neueste ${usage.length})` : ""}</span>} />
            <Table className="mt-3" caption="Projekte, die dieses Werkzeug verwenden">
              <thead>
                <tr>
                  <Th>Projekt</Th>
                  <Th>Eintrag im Projekt</Th>
                  <Th>Kategorie</Th>
                  <Th>Status</Th>
                  <Th>Angelegt</Th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 && <EmptyRow cols={5}>Noch in keinem Projekt verwendet.</EmptyRow>}
                {usage.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Link href={`/admin/inhalte/projekte/${u.project.id}`} className="font-semibold hover:underline">{u.project.title}</Link>
                      {u.project.owner.profile && <span className="ml-1.5 text-xs text-muted">@{u.project.owner.profile.handle}</span>}
                    </Td>
                    <Td className="text-ink-2">{u.name}</Td>
                    <Td className="whitespace-nowrap">{cats.get(u.project.category) ?? u.project.category}</Td>
                    <Td><Badge tone={stateTone(u.project.state)}>{STATE_LABEL[u.project.state] ?? u.project.state}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(u.project.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="w3">
            <SectionTitle n="03" title={<span id="w3">Verlauf (Audit)</span>} />
            <AuditHistory rows={d.recentAudit} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Werkzeugdaten">
          <section>
            <SectionTitle n="04" title="Hinweise" />
            <div className="mt-3 space-y-3 text-[13px]">
              <p className={t.notes ? "whitespace-pre-wrap text-ink-2" : "text-muted"}>{t.notes || "Keine Hinweise."}</p>
              {t.safetyInfo && (
                <Notice tone="warn" title="Sicherheitshinweis">
                  <span className="whitespace-pre-wrap">{t.safetyInfo}</span>
                </Notice>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
