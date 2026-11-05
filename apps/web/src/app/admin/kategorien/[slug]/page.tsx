import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PRODUCT_STATUS_LABEL, formatMoney, type Currency } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getCategoryAdminDetail } from "@/server/admin/catalog-settings";
import { ReasonButton } from "@/components/admin/action-controls";
import { CategoryEditButton } from "@/components/admin/category-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { Glyph } from "@/components/ui/glyphs";
import { activateCategoryAction, deactivateCategoryAction, resetCategoryAction, updateCategoryAction } from "../actions";
import { AuditHistory, BackLink, STATE_LABEL, stateTone } from "../shared";

export const metadata: Metadata = { title: "Kategorie" };

const PRODUCT_TONE: Record<string, "moss" | "neutral" | "danger" | "warn"> = { ACTIVE: "moss", DRAFT: "neutral", PAUSED: "warn", SOLD_OUT: "neutral", DISABLED: "danger" };

export default async function CategoryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/kategorien/${slug}`);
  let d;
  try {
    d = await getCategoryAdminDetail(actor, slug);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { category: c, setting: s, counts, recent } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const lastActive = c.isActive && d.activeCount <= 1;

  return (
    <div>
      <BackLink />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex items-center gap-4">
          <span className={`grid size-16 shrink-0 place-items-center rounded-2xl ${c.isActive ? "bg-moss-soft text-moss-ink" : "bg-sunken text-muted"}`}>
            <Glyph name={c.glyph} size={34} strokeWidth={1.5} />
          </span>
          <div>
            <p className="spec mb-1">
              DIY-Kategorie · Position {String(c.position).padStart(2, "0")} von {d.total}
            </p>
            <h1 className="display text-[2.2rem]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[12px] text-muted">{c.slug}</span>
              {c.isActive ? <Badge tone="moss">Aktiv</Badge> : <Badge>Inaktiv</Badge>}
              {c.focus && <Badge tone="clay">Startschwerpunkt</Badge>}
              {c.overridden && <Badge tone="outline">Angepasst</Badge>}
              <Link href={`/entdecken?kategorie=${c.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                Auf „Entdecken“ ansehen <ExternalLink size={12} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <CategoryEditButton
              initial={{ name: s?.name ?? "", short: s?.short ?? "", description: s?.description ?? "", sortOrder: s?.sortOrder ?? null, focus: s?.isFocus ?? null }}
              defaults={{ ...c.defaults, position: c.defaultPosition }}
              action={updateCategoryAction.bind(null, c.slug)}
            />
            {c.isActive && !lastActive && (
              <ReasonButton
                action={deactivateCategoryAction.bind(null, c.slug)}
                label="Deaktivieren"
                variant="outline"
                confirmVariant="danger"
                title="Kategorie deaktivieren"
                description="Die Kategorie wird für neue Inhalte nicht mehr angeboten und verschwindet aus Filtern und Kategorie-Listen. Bestehende Inhalte behalten sie und bleiben erreichbar."
                confirmLabel="Deaktivieren"
              />
            )}
            {!c.isActive && (
              <ReasonButton
                action={activateCategoryAction.bind(null, c.slug)}
                label="Aktivieren"
                variant="outline"
                title="Kategorie aktivieren"
                description="Die Kategorie wird wieder in Editoren, Filtern und auf „Entdecken“ angeboten."
                confirmLabel="Aktivieren"
              />
            )}
            {s && (
              <ReasonButton
                action={resetCategoryAction.bind(null, c.slug)}
                label="Zurücksetzen auf Standard"
                variant="ghost"
                title="Auf Standard zurücksetzen"
                description={`Alle Anpassungen (Name, Kurzname, Beschreibung, Reihenfolge, Startschwerpunkt${c.isActive ? "" : ", Deaktivierung"}) werden entfernt. Es gelten wieder die Werte aus packages/shared.`}
                confirmLabel="Zurücksetzen"
              />
            )}
          </div>
        )}
      </header>

      {!c.isActive && (
        <Notice tone="warn" className="mb-8" title="Kategorie deaktiviert">
          Wird für neue Inhalte nicht angeboten und nicht in Filtern gelistet. {num(counts.projects + counts.tutorials + counts.posts + counts.products + counts.communities)} bestehende Inhalte behalten die Kategorie.
        </Notice>
      )}
      {!isAdmin && (
        <Notice className="mb-8">Änderungen an Kategorien nimmt die Administration vor.</Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="k1">
            <SectionTitle n="01" title={<span id="k1">Inhalte in dieser Kategorie</span>} />
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-5">
              {(
                [
                  ["Projekte", counts.projectsLive, counts.projects],
                  ["Anleitungen", counts.tutorialsLive, counts.tutorials],
                  ["Beiträge", counts.postsLive, counts.posts],
                  ["Produkte", counts.productsLive, counts.products],
                  ["Communities", counts.communitiesLive, counts.communities],
                ] as const
              ).map(([l, live, all]) => (
                <div key={l} className="border-l border-line pl-4">
                  <dt className="spec">{l}</dt>
                  <dd className="mt-1 text-xl font-semibold num">{num(live)}</dd>
                  <dd className="text-xs text-muted">{num(all)} gesamt</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Grosse Zahl: veröffentlicht bzw. aktiv. Darunter: alle Zustände inkl. Entwürfe.</p>
          </section>

          <section aria-labelledby="k2">
            <SectionTitle n="02" title={<span id="k2">Neueste Projekte</span>} />
            <Table className="mt-3" caption="Neueste Projekte">
              <thead>
                <tr>
                  <Th>Projekt</Th>
                  <Th>Von</Th>
                  <Th>Status</Th>
                  <Th>Angelegt</Th>
                </tr>
              </thead>
              <tbody>
                {recent.projects.length === 0 && <EmptyRow cols={4}>Keine Projekte.</EmptyRow>}
                {recent.projects.map((p) => (
                  <Tr key={p.id}>
                    <Td><Link href={`/admin/inhalte/projekte/${p.id}`} className="font-semibold hover:underline">{p.title}</Link></Td>
                    <Td className="text-muted">{p.owner.profile ? `@${p.owner.profile.handle}` : "–"}</Td>
                    <Td><Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state] ?? p.state}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(p.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="k3">
            <SectionTitle n="03" title={<span id="k3">Neueste Anleitungen</span>} />
            <Table className="mt-3" caption="Neueste Anleitungen">
              <thead>
                <tr>
                  <Th>Anleitung</Th>
                  <Th>Von</Th>
                  <Th>Status</Th>
                  <Th>Angelegt</Th>
                </tr>
              </thead>
              <tbody>
                {recent.tutorials.length === 0 && <EmptyRow cols={4}>Keine Anleitungen.</EmptyRow>}
                {recent.tutorials.map((t) => (
                  <Tr key={t.id}>
                    <Td><Link href={`/admin/inhalte/anleitungen/${t.id}`} className="font-semibold hover:underline">{t.title || "Ohne Titel"}</Link></Td>
                    <Td className="text-muted">{t.author.profile ? `@${t.author.profile.handle}` : "–"}</Td>
                    <Td><Badge tone={stateTone(t.state)}>{STATE_LABEL[t.state] ?? t.state}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(t.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="k4">
            <SectionTitle n="04" title={<span id="k4">Neueste Produkte</span>} />
            <Table className="mt-3" caption="Neueste Produkte">
              <thead>
                <tr>
                  <Th>Produkt</Th>
                  <Th>Shop</Th>
                  <Th align="right">Preis</Th>
                  <Th>Status</Th>
                  <Th>Angelegt</Th>
                </tr>
              </thead>
              <tbody>
                {recent.products.length === 0 && <EmptyRow cols={5}>Keine Produkte.</EmptyRow>}
                {recent.products.map((p) => (
                  <Tr key={p.id}>
                    <Td><Link href={`/admin/marktplatz/produkte/${p.id}`} className="font-semibold hover:underline">{p.title || "Ohne Titel"}</Link></Td>
                    <Td className="text-muted">{p.shop.name}</Td>
                    <Td align="right">{formatMoney(p.priceMinor, p.currency as Currency)}</Td>
                    <Td><Badge tone={PRODUCT_TONE[p.status] ?? "neutral"}>{PRODUCT_STATUS_LABEL[p.status as keyof typeof PRODUCT_STATUS_LABEL] ?? p.status}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(p.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="k5">
            <SectionTitle n="05" title={<span id="k5">Communities</span>} />
            <Table className="mt-3" caption="Communities in dieser Kategorie">
              <thead>
                <tr>
                  <Th>Community</Th>
                  <Th align="right">Mitglieder</Th>
                  <Th>Status</Th>
                  <Th>Gegründet</Th>
                </tr>
              </thead>
              <tbody>
                {recent.communities.length === 0 && <EmptyRow cols={4}>Keine Communities.</EmptyRow>}
                {recent.communities.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/admin/communities/${m.id}`} className="font-semibold hover:underline">{m.name}</Link>
                      <span className="ml-1.5 font-mono text-[11px] text-muted">/c/{m.slug}</span>
                    </Td>
                    <Td align="right">{num(m.memberCount)}</Td>
                    <Td><Badge tone={stateTone(m.state)}>{STATE_LABEL[m.state] ?? m.state}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(m.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="k6">
            <SectionTitle n="06" title={<span id="k6">Verlauf (Audit)</span>} />
            <AuditHistory rows={d.recentAudit} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Kategoriedaten">
          <section>
            <SectionTitle n="07" title="Darstellung" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <Row label="Name" value={c.name} fallback={c.defaults.name} overridden={!!s?.name} />
              <Row label="Kurzname" value={c.short} fallback={c.defaults.short} overridden={!!s?.short} />
              <Row label="Reihenfolge" value={String(c.position)} fallback={String(c.defaultPosition)} overridden={s?.sortOrder != null} />
              <Row label="Startschwerpunkt" value={c.focus ? "Ja" : "Nein"} fallback={c.defaults.focus ? "Ja" : "Nein"} overridden={s?.isFocus != null} />
              <div>
                <dt className="spec">Beschreibung</dt>
                <dd className={c.description ? "whitespace-pre-wrap text-ink-2" : "text-muted"}>{c.description || "Keine – Standardtext auf „Entdecken“"}</dd>
              </div>
              <div>
                <dt className="spec">Glyphe</dt>
                <dd className="font-mono text-[12px]">{c.glyph}</dd>
              </div>
            </dl>
          </section>

          <section>
            <SectionTitle n="08" title="Technik" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div>
                <dt className="spec">Slug</dt>
                <dd className="font-mono text-[12px]">{c.slug}</dd>
                <dd className="text-muted">Fix – geteilt mit der iOS-App und auf Inhalten gespeichert.</dd>
              </div>
              <div>
                <dt className="spec">Zuletzt geändert</dt>
                <dd>{s ? dateTime(s.updatedAt) : "Nie (Standardwerte)"}</dd>
                {d.updatedBy && <dd className="text-muted">von @{d.updatedBy.handle}</dd>}
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, fallback, overridden }: { label: string; value: string; fallback: string; overridden: boolean }) {
  return (
    <div>
      <dt className="spec">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      <dd className="text-muted">{overridden ? `Angepasst · Standard: ${fallback}` : "Standard"}</dd>
    </div>
  );
}
