import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CATEGORIES, COUNTRY_LABEL, PRODUCT_STATUS_LABEL, categoryBySlug, type ShipCountry, listCategories } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getProductAdminDetail } from "@/server/admin/shops";
import { minorToInput } from "@/server/commerce/rules";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { ProductEditButton } from "@/components/admin/market-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, dec, num, shortDate } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { decideProductAction, setProductFeaturedAction, updateProductAction } from "../../actions";
import { AuditList, CasesTable, ReviewsTable, SHOP_STATUS, StatGrid, kindLabel, money, orderLabel, orderTone, productTone, shopTone } from "../../shared";

export const metadata: Metadata = { title: "Produkt verwalten" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/marktplatz/produkte/${id}`);
  let d;
  try {
    d = await getProductAdminDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { product: p } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const isPublic = (p.status === "ACTIVE" || p.status === "SOLD_OUT") && p.shop.status === "ACTIVE";
  const openCases = d.cases.filter((c) => c.status === "OPEN" || c.status === "IN_REVIEW" || c.status === "APPEALED").length;
  const baseStock = p.inventory[0];
  const stock = p.variants.length
    ? p.variants.reduce((s, v) => s + Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)), 0)
    : baseStock
      ? Math.max(0, baseStock.onHand - baseStock.reserved)
      : null;
  const reserved = p.variants.length ? p.variants.reduce((s, v) => s + (v.inventory?.reserved ?? 0), 0) : (baseStock?.reserved ?? 0);

  return (
    <div>
      <Link href={`/admin/marktplatz/${p.shop.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> {p.shop.name}
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex items-center gap-4">
          {p.coverUrl ? (
            <img src={p.coverUrl} alt="" className="size-20 shrink-0 rounded-2xl border border-line object-cover" />
          ) : (
            <span aria-hidden className="size-20 shrink-0 rounded-2xl border border-line bg-sunken" />
          )}
          <div className="min-w-0">
            <p className="spec mb-1">Produkt · {p.id}</p>
            <h1 className="display text-[2.2rem] leading-tight">{p.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold num">{money(p.priceMinor, p.currency)}</span>
              <Badge tone={productTone(p.status)}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
              {p.isFeatured && <Badge tone="clay">Hervorgehoben</Badge>}
              <Badge tone="outline">{kindLabel(p.kind)}</Badge>
              {isPublic && (
                <Link href={`/markt/${p.shop.slug}/${p.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  Angebot ansehen <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Shop{" "}
              <Link href={`/admin/marktplatz/${p.shop.id}`} className="font-semibold text-ink hover:underline">
                {p.shop.name}
              </Link>{" "}
              <Badge tone={shopTone(p.shop.status)} className="ml-1">{SHOP_STATUS[p.shop.status]}</Badge>
              <span className="ml-2">
                von{" "}
                <Link href={`/admin/nutzer/${p.shop.ownerId}`} className="hover:underline">
                  @{p.shop.owner.profile?.handle ?? "–"}
                </Link>
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "ACTIVE" && p.shop.status === "ACTIVE" && (
            <ActionButton action={setProductFeaturedAction.bind(null, p.id, !p.isFeatured)} label={p.isFeatured ? "Nicht mehr hervorheben" : "Hervorheben"} variant="outline" />
          )}
          {(p.status === "ACTIVE" || p.status === "SOLD_OUT") && (
            <ReasonButton action={decideProductAction.bind(null, p.id, "PAUSE")} label="Ausblenden" variant="outline" title="Angebot ausblenden" description="Das Angebot wird pausiert und ist nicht mehr kaufbar. Der Shop kann es danach selbst wieder aktivieren." withPublicNote confirmLabel="Ausblenden" />
          )}
          {p.status === "PAUSED" && p.shop.status === "ACTIVE" && (
            <ReasonButton action={decideProductAction.bind(null, p.id, "ACTIVATE")} label="Aktivieren" variant="outline" title="Angebot aktivieren" description="Das Angebot wird wieder öffentlich (ohne Bestand als ausverkauft)." confirmLabel="Aktivieren" />
          )}
          {p.status !== "DISABLED" && (
            <ReasonButton action={decideProductAction.bind(null, p.id, "DISABLE")} label="Entfernen" variant="danger" confirmVariant="danger" title="Angebot entfernen" description="Das Angebot wird deaktiviert und kann vom Shop nicht mehr bearbeitet oder aktiviert werden. Bei gemeldeten Angeboten bitte den Moderationsfall nutzen." withPublicNote confirmLabel="Entfernen" />
          )}
          {p.status === "DISABLED" && isAdmin && (
            <ReasonButton action={decideProductAction.bind(null, p.id, "RESTORE")} label="Wiederherstellen" variant="outline" title="Angebot wiederherstellen" description="Das Angebot wird als pausiert wiederhergestellt; der Shop kann es danach selbst aktivieren." confirmLabel="Wiederherstellen" />
          )}
          <ProductEditButton
            action={updateProductAction.bind(null, p.id)}
            initial={{ title: p.title, description: p.description, category: p.category, materials: p.materials, dimensions: p.dimensions, safetyInfo: p.safetyInfo, returnPolicy: p.returnPolicy, price: minorToInput(p.priceMinor) }}
            categories={listCategories().map((c) => ({ value: c.slug, label: c.name + (c.isActive ? "" : " (inaktiv)") }))}
            canEditPrice={isAdmin}
            currency={p.currency}
          />
        </div>
      </header>

      {p.status === "DISABLED" && (
        <Notice tone="danger" className="mb-8" title="Angebot entfernt">
          Nicht kaufbar und für den Shop gesperrt. {isAdmin ? "Wiederherstellen kann nur die Administration." : "Eine Wiederherstellung ist der Administration vorbehalten."}
        </Notice>
      )}
      {p.shop.status !== "ACTIVE" && p.status !== "DISABLED" && (
        <Notice tone="warn" className="mb-8" title={`Shop ${SHOP_STATUS[p.shop.status]?.toLowerCase()}`}>
          Solange der Shop nicht aktiv ist, ist das Angebot nicht öffentlich.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="p1">
            <SectionTitle n="01" title={<span id="p1">Kennzahlen</span>} />
            <StatGrid
              items={[
                { label: "Verkaufte Stück", value: num(d.unitsSold), note: `${num(p._count.orderItems)} Positionen` },
                { label: "Verfügbar", value: stock == null ? "–" : num(stock), note: reserved ? `${num(reserved)} reserviert` : p.kind === "DIGITAL" ? "digital" : undefined },
                { label: "Bewertung", value: p.ratingCount ? dec(p.ratingAvg) : "–", note: `${num(p.ratingCount)} sichtbar · ${num(p._count.reviews)} gesamt` },
                { label: "Offene Fälle", value: num(openCases), note: d.openReports ? `${num(d.openReports)} offene Meldungen` : undefined, alert: openCases > 0 || d.openReports > 0 },
                { label: "Aufrufe", value: num(p.viewCount) },
                { label: "Gemerkt", value: num(p.saveCount) },
                { label: "In Warenkörben", value: num(p._count.cartItems) },
                ...(p.kind === "DIGITAL" ? [{ label: "Lizenzen", value: num(p._count.entitlements) }] : [{ label: "Bilder", value: num(p._count.media) }]),
              ]}
            />
          </section>

          <section aria-labelledby="p2">
            <SectionTitle n="02" title={<span id="p2">Angaben</span>} />
            <div className="mt-4 space-y-5 text-[13.5px]">
              {p.description ? <p className="whitespace-pre-wrap leading-relaxed text-ink-2">{p.description}</p> : <p className="text-muted">Keine Beschreibung.</p>}
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {[
                  ["Materialien", p.materials],
                  ["Masse", p.dimensions],
                  ["Sicherheitshinweise", p.safetyInfo],
                  ["Rückgabe", p.returnPolicy],
                ].map(([l, v]) => (
                  <div key={l} className="border-l border-line pl-4">
                    <dt className="spec">{l}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ink-2">{v || "–"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section aria-labelledby="p3">
            <SectionTitle n="03" title={<span id="p3">{p.variants.length ? `Varianten & Bestand (${p.variants.length})` : "Bestand"}</span>} />
            {p.kind === "DIGITAL" ? (
              <p className="mt-3 text-sm text-muted">Digitales Produkt – kein Bestand. Datei {p.digitalKey ? "hinterlegt" : "fehlt"}.</p>
            ) : (
              <Table className="mt-3" caption="Varianten und Bestand">
                <thead>
                  <tr>
                    <Th>Variante</Th>
                    <Th align="right">Preis</Th>
                    <Th align="right">An Lager</Th>
                    <Th align="right">Reserviert</Th>
                    <Th align="right">Verfügbar</Th>
                    <Th align="right">Verkauft</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.variants.length === 0 && !baseStock && <EmptyRow cols={6}>Kein Bestand erfasst.</EmptyRow>}
                  {p.variants.length === 0 && baseStock && (
                    <Tr>
                      <Td className="text-muted">Ohne Varianten</Td>
                      <Td align="right">{money(p.priceMinor, p.currency)}</Td>
                      <Td align="right">{num(baseStock.onHand)}</Td>
                      <Td align="right">{num(baseStock.reserved)}</Td>
                      <Td align="right">{num(Math.max(0, baseStock.onHand - baseStock.reserved))}</Td>
                      <Td align="right">{num(p._count.orderItems)}</Td>
                    </Tr>
                  )}
                  {p.variants.map((v) => (
                    <Tr key={v.id}>
                      <Td className="font-semibold">{v.name}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        {money(p.priceMinor + v.priceDeltaMinor, p.currency)}
                        {v.priceDeltaMinor !== 0 && <span className="block text-xs text-muted">{v.priceDeltaMinor > 0 ? "+" : "−"}{money(Math.abs(v.priceDeltaMinor), p.currency)}</span>}
                      </Td>
                      <Td align="right">{num(v.inventory?.onHand ?? 0)}</Td>
                      <Td align="right">{num(v.inventory?.reserved ?? 0)}</Td>
                      <Td align="right">{num(Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)))}</Td>
                      <Td align="right">{num(v._count.orderItems)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="p4">
            <SectionTitle n="04" title={<span id="p4">Letzte Bestellungen</span>} />
            <Table className="mt-3" caption="Bestellungen">
              <thead>
                <tr>
                  <Th>Bestellung</Th>
                  <Th>Käufer:in</Th>
                  <Th>Variante</Th>
                  <Th align="right">Menge</Th>
                  {isAdmin && <Th align="right">Stückpreis</Th>}
                  <Th>Status</Th>
                  <Th>Datum</Th>
                </tr>
              </thead>
              <tbody>
                {d.orderItems.length === 0 && <EmptyRow cols={isAdmin ? 7 : 6}>Noch keine Bestellungen.</EmptyRow>}
                {d.orderItems.map((i) => (
                  <Tr key={i.id} highlight={i.order.status === "PROBLEM"}>
                    <Td mono>{i.order.number}</Td>
                    <Td><Link href={`/admin/nutzer/${i.order.buyer.id}`} className="hover:underline">@{i.order.buyer.profile?.handle ?? "–"}</Link></Td>
                    <Td className="text-muted">{i.variantName ?? "–"}</Td>
                    <Td align="right">{num(i.quantity)}</Td>
                    {isAdmin && <Td align="right" className="whitespace-nowrap">{i.unitMinor != null ? money(i.unitMinor, i.order.currency) : "–"}</Td>}
                    <Td><Badge tone={orderTone(i.order.status)}>{orderLabel(i.order.status)}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(i.order.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="p5">
            <SectionTitle n="05" title={<span id="p5">Bewertungen ({num(p._count.reviews)})</span>} />
            <ReviewsTable reviews={d.reviews} />
          </section>

          <section aria-labelledby="p6">
            <SectionTitle n="06" title={<span id="p6">Meldungen & Moderationsfälle ({d.cases.length})</span>} />
            <CasesTable cases={d.cases} />
          </section>

          <section aria-labelledby="p7">
            <SectionTitle n="07" title={<span id="p7">Verlauf (Audit)</span>} />
            <AuditList rows={d.recentAudit} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Produktdaten">
          <section>
            <SectionTitle n="08" title="Daten" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div><dt className="spec">Kategorie</dt><dd>{categoryBySlug(p.category)?.name ?? p.category}</dd></div>
              <div><dt className="spec">Art</dt><dd>{kindLabel(p.kind)}</dd></div>
              <div><dt className="spec">Preis</dt><dd>{money(p.priceMinor, p.currency)}</dd></div>
              {p.kind !== "DIGITAL" && (
                <>
                  <div><dt className="spec">Versand</dt><dd>{money(p.shippingMinor, p.currency)} · ab {COUNTRY_LABEL[p.shipsFrom as ShipCountry] ?? p.shipsFrom}</dd></div>
                  <div><dt className="spec">Herstellungszeit</dt><dd>{p.productionDays} Tage</dd></div>
                </>
              )}
              <div><dt className="spec">Slug</dt><dd className="font-mono text-[12px]">{p.slug}</dd></div>
              <div><dt className="spec">Veröffentlicht</dt><dd>{p.publishedAt ? dateTime(p.publishedAt) : "–"}</dd></div>
              <div><dt className="spec">Angelegt</dt><dd>{dateTime(p.createdAt)}</dd></div>
              <div><dt className="spec">Zuletzt geändert</dt><dd>{relativeTime(p.updatedAt)}</dd></div>
            </dl>
          </section>
          {(p.project || p.tutorial) && (
            <section>
              <SectionTitle n="09" title="Verknüpfungen" />
              <ul className="mt-3 space-y-2 text-[13px]">
                {p.project && <li><span className="spec mr-2">Projekt</span>{p.project.title}</li>}
                {p.tutorial && <li><span className="spec mr-2">Anleitung</span>{p.tutorial.title}</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
