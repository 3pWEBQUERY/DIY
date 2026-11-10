import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { COUNTRY_LABEL, PRODUCT_STATUS_LABEL, type ShipCountry } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { getShopAdminDetail, PRODUCT_STATUSES } from "@/server/admin/shops";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { ShopEditButton } from "@/components/admin/market-admin";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, dec, num, shortDate } from "@/components/admin/format";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { decideProductAction, decideShopAction, rejectShopVerificationAction, setPayoutHoldWaivedAction, setProductFeaturedAction, updateShopAction } from "../actions";
import { AuditList, CasesTable, NameLink, ReviewsTable, SHOP_STATUS, StatGrid, Thumb, VERIF, kindLabel, money, orderLabel, orderTone, paymentLabel, productTone, shopTone, stockOf, verifTone } from "../shared";
import { describeStripeNote } from "@/lib/stripe-status";

export const metadata: Metadata = { title: "Shop verwalten" };

export default async function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/marktplatz/${id}`);
  let d;
  try {
    d = await getShopAdminDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { shop: s, orders, money: m } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const v = s.verification;
  const isPublic = s.status === "ACTIVE" || s.status === "PAUSED";
  const ownerName = s.owner.profile?.displayName ?? "Ohne Profil";
  const titleOf = new Map(d.products.map((p) => [p.id, p.title]));

  return (
    <div>
      <Link href="/admin/marktplatz" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Shops
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex items-center gap-4">
          <Avatar name={s.name} size={64} />
          <div>
            <p className="spec mb-1">Shop · {s.id}</p>
            <h1 className="display text-[2.2rem]">{s.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">/markt/{s.slug}</span>
              <Badge tone={shopTone(s.status)}>{SHOP_STATUS[s.status]}</Badge>
              <Badge tone={verifTone(v?.state ?? "NOT_STARTED")}>Verifizierung {VERIF[v?.state ?? "NOT_STARTED"]}</Badge>
              <Badge tone="outline">{s.sellerType === "BUSINESS" ? "Gewerblich" : "Privat"}</Badge>
              {isPublic && (
                <Link href={`/markt/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  Shop ansehen <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Inhaber:in{" "}
              <Link href={`/admin/nutzer/${s.owner.id}`} className="font-semibold text-ink hover:underline">
                {ownerName}
              </Link>{" "}
              @{s.owner.profile?.handle ?? "–"}
              {s.owner.status !== "ACTIVE" && <Badge tone="danger" className="ml-2">Konto {s.owner.status === "DELETED" ? "gelöscht" : "gesperrt"}</Badge>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(s.status === "PENDING_VERIFICATION" || s.status === "DRAFT") && (
            <ReasonButton action={decideShopAction.bind(null, s.id, "APPROVE")} label="Freigeben" variant="primary" confirmVariant="primary" title={`„${s.name}“ freigeben`} description="Manuelle Freigabe nach Prüfung von Identität, Angebot und Richtlinien. Die Prüfung wird protokolliert. Käufe sind erst möglich, wenn der Shop zusätzlich sein Auszahlungskonto bei Stripe verbunden hat." reasonLabel="Prüfnotiz" confirmLabel="Shop freigeben" />
          )}
          {s.status === "PENDING_VERIFICATION" && (
            <ReasonButton
              action={rejectShopVerificationAction.bind(null, s.id)}
              label="Antrag ablehnen"
              variant="outline"
              confirmVariant="danger"
              title="Verifizierungsantrag ablehnen"
              description="Der Shop geht zurück in den Entwurf. Die Person kann die Angaben ergänzen und erneut einreichen."
              withPublicNote
              confirmLabel="Ablehnen"
            />
          )}
          {s.status === "ACTIVE" && <ReasonButton action={decideShopAction.bind(null, s.id, "PAUSE")} label="Pausieren" variant="outline" title="Shop pausieren" description="Der Shop und seine Produkte sind vorübergehend nicht sichtbar." confirmLabel="Pausieren" />}
          {(s.status === "PAUSED" || (s.status === "SUSPENDED" && isAdmin)) && (
            <ReasonButton action={decideShopAction.bind(null, s.id, "REACTIVATE")} label="Reaktivieren" variant="outline" title="Shop reaktivieren" description={s.status === "SUSPENDED" ? "Pausierte Produkte bleiben pausiert und werden vom Shop selbst wieder aktiviert." : undefined} confirmLabel="Reaktivieren" />
          )}
          {s.status !== "SUSPENDED" && s.status !== "DRAFT" && (
            <ReasonButton action={decideShopAction.bind(null, s.id, "SUSPEND")} label="Sperren" variant="danger" confirmVariant="danger" title="Shop sperren" description="Alle aktiven Produkte werden pausiert und sind nicht mehr kaufbar. Offene Bestellungen bleiben bestehen." confirmLabel="Shop sperren" />
          )}
          <ShopEditButton
            action={updateShopAction.bind(null, s.id)}
            initial={{ name: s.name, tagline: s.tagline, description: s.description, shippingPolicy: s.shippingPolicy, returnPolicy: s.returnPolicy, processingDays: s.processingDays }}
          />
        </div>
      </header>

      {s.status === "SUSPENDED" && (
        <Notice tone="danger" className="mb-8" title="Shop gesperrt">
          Angebote sind nicht kaufbar. {isAdmin ? "Reaktivieren kann nur die Administration." : "Eine Reaktivierung ist der Administration vorbehalten."}
        </Notice>
      )}
      {s.status === "PENDING_VERIFICATION" && (
        <Notice tone="warn" className="mb-8" title="Verifizierung ausstehend">
          {v?.state === "PENDING" ? "Der Antrag ist eingereicht; die Prüfung beim Zahlungsanbieter läuft." : "Der Antrag wartet auf manuelle Prüfung."} Vor der Freigabe Identität, Angebot und Richtlinien prüfen.
        </Notice>
      )}
      {v?.state === "REJECTED" && s.status === "DRAFT" && (
        <Notice className="mb-8" title="Antrag abgelehnt">
          {v.reviewedAt ? `Am ${dateTime(v.reviewedAt)}. ` : ""}
          {describeStripeNote(v.notes)?.text ?? (v.notes || "Ohne Notiz.")}
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="s1">
            <SectionTitle n="01" title={<span id="s1">Kennzahlen</span>} />
            <StatGrid
              items={[
                { label: "Produkte", value: num(d.productTotal), note: `${num(d.productsByStatus.ACTIVE ?? 0)} aktiv` },
                ...PRODUCT_STATUSES.filter((k) => k !== "ACTIVE").map((k) => ({ label: PRODUCT_STATUS_LABEL[k], value: num(d.productsByStatus[k] ?? 0), alert: k === "DISABLED" && (d.productsByStatus[k] ?? 0) > 0 })),
                { label: "Bestellungen", value: num(orders.total), note: `${num(orders.open)} in Abwicklung` },
                { label: "Problemfälle", value: num(orders.problem), alert: orders.problem > 0 },
                { label: "Bewertung", value: s.ratingCount ? dec(s.ratingAvg) : "–", note: `${num(s.ratingCount)} Bewertungen${d.reviewsHidden ? ` · ${d.reviewsHidden} ausgeblendet` : ""}` },
                { label: "Offene Fälle", value: num(d.openCases), alert: d.openCases > 0 },
                ...(m
                  ? [
                      { label: "Umsatz (GMV)", value: money(m.gmvMinor, s.currency), note: `Gebühren ${money(m.feeMinor, s.currency)}`, restricted: true },
                      { label: "Streitfälle", value: num(m.disputed), note: `${num(m.refundsPending)} Erstattungen offen`, restricted: true, alert: m.disputed > 0 },
                    ]
                  : []),
              ]}
            />
          </section>

          <section aria-labelledby="s2">
            <SectionTitle
              n="02"
              title={<span id="s2">Produkte ({num(d.productTotal)})</span>}
              action={d.productTotal > d.products.length ? <Link href={`/admin/marktplatz?ansicht=produkte&shop=${s.slug}`} className="text-[13px] text-muted hover:text-ink">Alle anzeigen →</Link> : undefined}
            />
            <Table className="mt-3" caption="Produkte">
              <thead>
                <tr>
                  <Th>Produkt</Th>
                  <Th>Status</Th>
                  <Th align="right">Preis</Th>
                  <Th align="right">Bestand</Th>
                  <Th align="right">Verkäufe</Th>
                  <Th align="right">Bewertung</Th>
                  <Th align="right">Aktionen</Th>
                </tr>
              </thead>
              <tbody>
                {d.products.length === 0 && <EmptyRow cols={7}>Noch keine Produkte.</EmptyRow>}
                {d.products.map((p) => {
                  const stock = stockOf(p.inventory);
                  return (
                    <Tr key={p.id}>
                      <Td className="max-w-[280px]">
                        <span className="flex items-center gap-2.5">
                          <Thumb src={p.coverUrl} alt="" />
                          <span className="min-w-0">
                            <NameLink href={`/admin/marktplatz/produkte/${p.id}`} publicHref={(p.status === "ACTIVE" || p.status === "SOLD_OUT") && s.status === "ACTIVE" ? `/markt/${s.slug}/${p.slug}` : null}>
                              <span className="line-clamp-1">{p.title}</span>
                            </NameLink>
                            <span className="block text-xs text-muted">{kindLabel(p.kind)} · {relativeTime(p.updatedAt)}</span>
                          </span>
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Badge tone={productTone(p.status)}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                        {p.isFeatured && <Badge tone="clay" className="ml-1.5">Hervorgehoben</Badge>}
                      </Td>
                      <Td align="right" className="whitespace-nowrap">{money(p.priceMinor, p.currency)}</Td>
                      <Td align="right">{stock == null ? "–" : num(stock)}</Td>
                      <Td align="right">{num(p._count.orderItems)}</Td>
                      <Td align="right">{p.ratingCount ? `${dec(p.ratingAvg)} (${p.ratingCount})` : "–"}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {p.status === "ACTIVE" && s.status === "ACTIVE" && (
                            <ActionButton action={setProductFeaturedAction.bind(null, p.id, !p.isFeatured)} label={p.isFeatured ? "Nicht mehr hervorheben" : "Hervorheben"} variant="ghost" />
                          )}
                          {(p.status === "ACTIVE" || p.status === "SOLD_OUT") && (
                            <ReasonButton action={decideProductAction.bind(null, p.id, "PAUSE")} label="Ausblenden" variant="ghost" title={`„${p.title}“ ausblenden`} description="Das Angebot wird pausiert und ist nicht mehr kaufbar. Der Shop kann es danach selbst wieder aktivieren." withPublicNote confirmLabel="Ausblenden" />
                          )}
                          {p.status !== "DISABLED" && (
                            <ReasonButton action={decideProductAction.bind(null, p.id, "DISABLE")} label="Entfernen" variant="ghost" confirmVariant="danger" title={`„${p.title}“ entfernen`} description="Das Angebot wird deaktiviert und kann vom Shop nicht mehr bearbeitet oder aktiviert werden. Bei gemeldeten Angeboten bitte den Moderationsfall nutzen." withPublicNote confirmLabel="Entfernen" />
                          )}
                          <Link href={`/admin/marktplatz/produkte/${p.id}`} className="inline-flex h-9 items-center rounded-xl border border-line-strong bg-card px-3.5 text-[13px] font-semibold hover:border-rule-strong">
                            Verwalten
                          </Link>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="s3">
            <SectionTitle n="03" title={<span id="s3">Letzte Bestellungen</span>} action={isAdmin ? <Link href={`/admin/transaktionen?q=${s.slug}`} className="text-[13px] text-muted hover:text-ink">In Transaktionen →</Link> : undefined} />
            <Table className="mt-3" caption="Bestellungen">
              <thead>
                <tr>
                  <Th>Bestellung</Th>
                  <Th>Käufer:in</Th>
                  <Th>Status</Th>
                  {isAdmin && <Th>Zahlung</Th>}
                  <Th align="right">Positionen</Th>
                  {isAdmin && <Th align="right">Betrag</Th>}
                  <Th>Datum</Th>
                </tr>
              </thead>
              <tbody>
                {orders.recent.length === 0 && <EmptyRow cols={isAdmin ? 7 : 5}>Noch keine Bestellungen.</EmptyRow>}
                {orders.recent.map((o) => (
                  <Tr key={o.id} highlight={o.status === "PROBLEM"}>
                    <Td mono>{o.number}</Td>
                    <Td><Link href={`/admin/nutzer/${o.buyer.id}`} className="hover:underline">@{o.buyer.profile?.handle ?? "–"}</Link></Td>
                    <Td><Badge tone={orderTone(o.status)}>{orderLabel(o.status)}</Badge></Td>
                    {isAdmin && <Td className="whitespace-nowrap text-[13px]">{o.payments[0] ? paymentLabel(o.payments[0].status) : "–"}</Td>}
                    <Td align="right">{num(o._count.items)}</Td>
                    {isAdmin && <Td align="right" className="whitespace-nowrap">{o.totalMinor != null ? money(o.totalMinor, o.currency) : "–"}</Td>}
                    <Td className="whitespace-nowrap text-muted">{shortDate(o.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="s4">
            <SectionTitle n="04" title={<span id="s4">Letzte Bewertungen</span>} />
            <ReviewsTable reviews={d.reviews} showProduct />
          </section>

          <section aria-labelledby="s5">
            <SectionTitle n="05" title={<span id="s5">Meldungen & Moderationsfälle ({d.cases.length})</span>} />
            <CasesTable cases={d.cases} contentLabel={(c) => (c.targetType === "PRODUCT" ? titleOf.get(c.targetId) ?? "Produkt" : "Bewertung")} />
          </section>

          <section aria-labelledby="s6">
            <SectionTitle n="06" title={<span id="s6">Verlauf (Audit)</span>} />
            <AuditList rows={d.recentAudit} />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Stammdaten">
          <section>
            <SectionTitle n="07" title="Stammdaten" />
            <dl className="mt-3 space-y-3 text-[13px]">
              {s.tagline && <div><dt className="spec">Kurzbeschreibung</dt><dd>{s.tagline}</dd></div>}
              <div><dt className="spec">Land · Währung</dt><dd>{COUNTRY_LABEL[s.country as ShipCountry] ?? s.country} · {s.currency}</dd></div>
              <div><dt className="spec">Bearbeitungszeit</dt><dd>{s.processingDays} Tage</dd></div>
              <div><dt className="spec">Verkäufe</dt><dd>{num(s.salesCount)}</dd></div>
              <div><dt className="spec">Eröffnet</dt><dd>{dateTime(s.createdAt)}</dd></div>
              <div><dt className="spec">Zuletzt geändert</dt><dd>{relativeTime(s.updatedAt)}</dd></div>
            </dl>
          </section>

          <section>
            <SectionTitle n="08" title="Verifizierung" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div><dt className="spec">Status</dt><dd><Badge tone={verifTone(v?.state ?? "NOT_STARTED")}>{VERIF[v?.state ?? "NOT_STARTED"]}</Badge></dd></div>
              {v?.businessName && <div><dt className="spec">Firma</dt><dd>{v.businessName}</dd></div>}
              {v?.reviewedAt && <div><dt className="spec">Geprüft</dt><dd>{dateTime(v.reviewedAt)}{!v.reviewedBy ? " · automatisch" : ""}</dd></div>}
              {v?.notes && <div><dt className="spec">Prüfnotiz</dt><dd className="whitespace-pre-wrap text-ink-2">{describeStripeNote(v.notes) ? `${describeStripeNote(v.notes)!.title} (${v.notes.replace(/^Stripe:\s*/, "Stripe-Code: ")})` : v.notes}</dd></div>}
              {isAdmin ? (
                <>
                  {v?.legalName && <div><dt className="spec">Rechtlicher Name</dt><dd>{v.legalName}</dd></div>}
                  {v?.address && <div><dt className="spec">Adresse</dt><dd>{v.address}</dd></div>}
                  {v?.vatId && <div><dt className="spec">MWST-Nr.</dt><dd className="font-mono text-[12px]">{v.vatId}</dd></div>}
                </>
              ) : (
                <p className="text-xs text-muted">Identitäts- und Zahlungsangaben sieht nur die Administration.</p>
              )}
            </dl>
          </section>

          {isAdmin && (
            <section>
              <SectionTitle n="09" title="Zahlungen" />
              <ul className="mt-3 space-y-2 text-[13px]">
                <li className="flex justify-between"><span>Zahlungen</span><span className={s.chargesEnabled ? "font-semibold text-moss" : "text-muted"}>{s.chargesEnabled ? "aktiv" : "inaktiv"}</span></li>
                <li className="flex justify-between"><span>Auszahlungen</span><span className={s.payoutsEnabled ? "font-semibold text-moss" : "text-muted"}>{s.payoutsEnabled ? "aktiv" : "inaktiv"}</span></li>
                <li className="flex justify-between gap-3"><span>Konto</span><span className="truncate font-mono text-[12px] text-muted">{s.stripeAccountId ?? "–"}</span></li>
                <li className="flex justify-between"><span>Auszahlungsplan</span><span className="text-muted">{{ manual: "auf Anfrage", daily: "täglich", weekly: "wöchentlich", monthly: "monatlich" }[s.payoutInterval] ?? s.payoutInterval}</span></li>
                <li className="flex justify-between"><span>Haltefrist</span><span className={s.payoutHoldWaived ? "font-semibold text-warn" : "text-muted"}>{s.payoutHoldWaived ? "erlassen" : "gilt"}</span></li>
              </ul>
              <div className="mt-3">
                <ReasonButton
                  action={setPayoutHoldWaivedAction.bind(null, s.id, !s.payoutHoldWaived)}
                  label={s.payoutHoldWaived ? "Haltefrist wieder einführen" : "Haltefrist erlassen"}
                  variant="outline"
                  title={s.payoutHoldWaived ? "Haltefrist wieder einführen" : "Haltefrist erlassen"}
                  description={s.payoutHoldWaived ? "Erlöse werden wieder erst nach Abschluss der Bestellung plus Haltefrist auszahlbar." : "Für vertrauenswürdige Shops: Erlöse sind direkt nach Zahlungseingang auszahlbar. Problemfälle und angefochtene Zahlungen bleiben zurückgehalten. Das Risiko von Erstattungen nach der Auszahlung trägt die Plattform."}
                  confirmLabel={s.payoutHoldWaived ? "Wieder einführen" : "Erlassen"}
                />
              </div>
            </section>
          )}

          {(s.description || s.shippingPolicy || s.returnPolicy) && (
            <section>
              <SectionTitle n={isAdmin ? "10" : "09"} title="Texte" />
              <div className="mt-3 space-y-3 text-[13px]">
                {s.description && <div><p className="spec">Beschreibung</p><p className="mt-1 line-clamp-[12] whitespace-pre-wrap text-ink-2">{s.description}</p></div>}
                {s.shippingPolicy && <div><p className="spec">Versand</p><p className="mt-1 line-clamp-6 whitespace-pre-wrap text-ink-2">{s.shippingPolicy}</p></div>}
                {s.returnPolicy && <div><p className="spec">Rückgabe</p><p className="mt-1 line-clamp-6 whitespace-pre-wrap text-ink-2">{s.returnPolicy}</p></div>}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
