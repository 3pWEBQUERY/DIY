import Link from "next/link";
import type { Metadata } from "next";
import { PRODUCT_KIND as KINDS, PRODUCT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { listShops } from "@/server/admin/content";
import { listProductsAdmin, PRODUCT_STATUSES } from "@/server/admin/shops";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ReasonButton } from "@/components/admin/action-controls";
import { Badge } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { dec, num, shortDate } from "@/components/admin/format";
import { relativeTime } from "@/lib/utils";
import { decideShopAction } from "./actions";
import { NameLink, PRODUCT_KIND, SHOP_STATUS, Thumb, VERIF, kindLabel, manageLink, money, productTone, shopTone, stockOf } from "./shared";

export const metadata: Metadata = { title: "Marktplatz & Verkäufer" };

type SP = { ansicht?: string; status?: string; q?: string; seite?: string; art?: string; shop?: string; hervorgehoben?: string };

export default async function MarketAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/marktplatz");
  const sp = await searchParams;
  const view = sp.ansicht === "produkte" ? "produkte" : "shops";

  return (
    <div>
      <AdminHeader
        n="08"
        title="Marktplatz & Verkäufer"
        description="Shops prüfen und freigeben, Angebote verwalten. Nur echtes Handgemachtes, Materialsets und eigene Anleitungen – kein Dropshipping, keine Massenware (Marktplatz-Richtlinien). Umsätze und Zahlungsdaten sieht nur die Administration."
      />
      <Segments
        active={view}
        className="mb-6"
        items={[
          { key: "shops", label: "Shops", href: "/admin/marktplatz" },
          { key: "produkte", label: "Produkte", href: "/admin/marktplatz?ansicht=produkte" },
        ]}
      />
      {view === "shops" ? <ShopsView user={user} sp={sp} /> : <ProductsView user={user} sp={sp} />}
    </div>
  );
}

type User = Awaited<ReturnType<typeof adminPage>>;

async function ShopsView({ user, sp }: { user: User; sp: SP }) {
  const page = Math.max(1, Number(sp.seite) || 1);
  const status = sp.status && sp.status in SHOP_STATUS ? sp.status : null;
  const r = await listShops(user, { status, q: sp.q?.trim() || null, page });
  // Zahlungs-/Auszahlungsstatus nur für die Administration (§24.3)
  const isAdmin = hasRole(user, "ADMIN");

  return (
    <>
      <Segments
        active={status ?? "ALL"}
        items={[
          { key: "ALL", label: "Alle", href: "/admin/marktplatz" },
          ...Object.entries(SHOP_STATUS).map(([k, v]) => ({ key: k, label: v, href: `/admin/marktplatz?status=${k}`, count: r.byStatus[k] ?? 0 })),
        ]}
      />
      <FilterBar>
        {status && <input type="hidden" name="status" value={status} />}
        <FilterField label="Suche">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Shopname oder Slug" className={`${filterInput} w-56`} />
        </FilterField>
      </FilterBar>
      <Table caption="Shops">
        <thead>
          <tr>
            <Th>Shop</Th>
            <Th>Art</Th>
            <Th>Status</Th>
            <Th>Verifizierung</Th>
            {isAdmin && <Th>Zahlungen</Th>}
            <Th align="right">Produkte</Th>
            <Th align="right">Bewertung</Th>
            <Th>Seit</Th>
            <Th align="right">Entscheidung</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={isAdmin ? 9 : 8}>Keine Shops in dieser Ansicht.</EmptyRow>}
          {r.rows.map((s) => (
            <Tr key={s.id} highlight={s.status === "PENDING_VERIFICATION"}>
              <Td className="max-w-[260px]">
                <NameLink href={`/admin/marktplatz/${s.id}`} publicHref={s.status === "ACTIVE" || s.status === "PAUSED" ? `/markt/${s.slug}` : null}>
                  {s.name}
                </NameLink>
                <span className="block text-xs text-muted">
                  <Link href={`/admin/nutzer/${s.owner.id}`} className="hover:underline">@{s.owner.profile?.handle}</Link> · {s.country}
                </span>
              </Td>
              <Td className="whitespace-nowrap">{s.sellerType === "BUSINESS" ? "Gewerblich" : "Privat"}</Td>
              <Td><Badge tone={shopTone(s.status)}>{SHOP_STATUS[s.status]}</Badge></Td>
              <Td className="whitespace-nowrap text-[13px]">
                {VERIF[s.verification?.state ?? "NOT_STARTED"]}
                {s.verification?.businessName && <span className="block text-xs text-muted">{s.verification.businessName}</span>}
              </Td>
              {isAdmin && (
                <Td className="whitespace-nowrap text-[13px]">
                  <span className={s.chargesEnabled ? "text-moss" : "text-muted"}>{s.chargesEnabled ? "Zahlungen ✓" : "Zahlungen –"}</span>
                  <span className={`ml-2 ${s.payoutsEnabled ? "text-moss" : "text-muted"}`}>{s.payoutsEnabled ? "Auszahlung ✓" : "Auszahlung –"}</span>
                </Td>
              )}
              <Td align="right">
                <Link href={`/admin/marktplatz?ansicht=produkte&shop=${s.slug}`} className="hover:underline">{num(s._count.products)}</Link>
              </Td>
              <Td align="right">{s.ratingCount ? `${dec(s.ratingAvg)} (${s.ratingCount})` : "–"}</Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(s.createdAt)}</Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  {(s.status === "PENDING_VERIFICATION" || s.status === "DRAFT") && (
                    <ReasonButton action={decideShopAction.bind(null, s.id, "APPROVE")} label="Freigeben" variant="primary" confirmVariant="primary" title={`„${s.name}“ freigeben`} description="Manuelle Freigabe nach Prüfung von Identität, Angebot und Richtlinien. Die Prüfung wird protokolliert. Käufe sind erst möglich, wenn der Shop zusätzlich sein Auszahlungskonto bei Stripe verbunden hat." reasonLabel="Prüfnotiz" confirmLabel="Shop freigeben" />
                  )}
                  {s.status === "ACTIVE" && <ReasonButton action={decideShopAction.bind(null, s.id, "PAUSE")} label="Pausieren" variant="ghost" title="Shop pausieren" confirmLabel="Pausieren" />}
                  {(s.status === "PAUSED" || (s.status === "SUSPENDED" && isAdmin)) && <ReasonButton action={decideShopAction.bind(null, s.id, "REACTIVATE")} label="Reaktivieren" variant="outline" title="Shop reaktivieren" confirmLabel="Reaktivieren" />}
                  {s.status !== "SUSPENDED" && s.status !== "DRAFT" && (
                    <ReasonButton action={decideShopAction.bind(null, s.id, "SUSPEND")} label="Sperren" variant="ghost" confirmVariant="danger" title="Shop sperren" description="Alle aktiven Produkte werden pausiert und sind nicht mehr kaufbar. Offene Bestellungen bleiben bestehen." confirmLabel="Shop sperren" />
                  )}
                  <Link href={`/admin/marktplatz/${s.id}`} className={manageLink}>Verwalten</Link>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={(p) => `/admin/marktplatz?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}), seite: String(p) })}`} />
    </>
  );
}

async function ProductsView({ user, sp }: { user: User; sp: SP }) {
  const page = Math.max(1, Number(sp.seite) || 1);
  const status = sp.status && (PRODUCT_STATUSES as readonly string[]).includes(sp.status) ? sp.status : null;
  const featured = sp.hervorgehoben === "1";
  const r = await listProductsAdmin(user, { q: sp.q?.trim() || null, status, kind: sp.art, shop: sp.shop, featured, page });
  const keep = { ansicht: "produkte", q: sp.q, art: sp.art, shop: sp.shop, hervorgehoben: featured ? "1" : undefined };
  const qs = (extra: Record<string, string | undefined>) =>
    `/admin/marktplatz?${new URLSearchParams(Object.entries({ ...keep, ...extra }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <Segments
        active={status ?? "ALL"}
        items={[
          { key: "ALL", label: "Alle", href: qs({}), count: r.all },
          ...PRODUCT_STATUSES.map((k) => ({ key: k, label: PRODUCT_STATUS_LABEL[k], href: qs({ status: k }), count: r.byStatus[k] ?? 0 })),
        ]}
      />
      <FilterBar>
        <input type="hidden" name="ansicht" value="produkte" />
        {status && <input type="hidden" name="status" value={status} />}
        <FilterField label="Suche">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Titel, Slug oder ID" className={`${filterInput} w-56`} />
        </FilterField>
        <FilterField label="Shop">
          <input name="shop" defaultValue={sp.shop ?? ""} placeholder="Name oder Slug" className={`${filterInput} w-44`} />
        </FilterField>
        <FilterField label="Art">
          <Select name="art" defaultValue={sp.art ?? ""} className="h-9 w-auto min-w-[170px] text-[13.5px]">
            <option value="">Alle</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PRODUCT_KIND[k]}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Hervorgehoben">
          <Select name="hervorgehoben" defaultValue={featured ? "1" : ""} className="h-9 w-auto min-w-[150px] text-[13.5px]">
            <option value="">Alle</option>
            <option value="1">Nur hervorgehobene</option>
          </Select>
        </FilterField>
      </FilterBar>
      <p className="spec mb-2">{num(r.total)} Treffer</p>
      <Table caption="Produkte">
        <thead>
          <tr>
            <Th>Produkt</Th>
            <Th>Shop</Th>
            <Th>Art</Th>
            <Th>Status</Th>
            <Th align="right">Preis</Th>
            <Th align="right">Bestand</Th>
            <Th align="right">Verkäufe</Th>
            <Th align="right">Bewertung</Th>
            <Th>Geändert</Th>
            <Th align="right"><span className="sr-only">Aktion</span></Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={10}>Keine Produkte in dieser Ansicht.</EmptyRow>}
          {r.rows.map((p) => {
            const stock = stockOf(p.inventory);
            const isPublic = (p.status === "ACTIVE" || p.status === "SOLD_OUT") && p.shop.status === "ACTIVE";
            return (
              <Tr key={p.id}>
                <Td className="max-w-[300px]">
                  <span className="flex items-center gap-2.5">
                    <Thumb src={p.coverUrl} alt="" />
                    <span className="min-w-0">
                      <NameLink href={`/admin/marktplatz/produkte/${p.id}`} publicHref={isPublic ? `/markt/${p.shop.slug}/${p.slug}` : null} className="max-w-full">
                        <span className="line-clamp-1">{p.title}</span>
                      </NameLink>
                      <span className="block text-xs text-muted">{categoryBySlug(p.category)?.short ?? p.category}</span>
                    </span>
                  </span>
                </Td>
                <Td className="max-w-[180px]">
                  <Link href={`/admin/marktplatz/${p.shop.id}`} className="line-clamp-1 hover:underline">{p.shop.name}</Link>
                </Td>
                <Td className="whitespace-nowrap text-[13px]">{kindLabel(p.kind)}</Td>
                <Td className="whitespace-nowrap">
                  <Badge tone={productTone(p.status)}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                  {p.isFeatured && <Badge tone="clay" className="ml-1.5">Hervorgehoben</Badge>}
                </Td>
                <Td align="right" className="whitespace-nowrap">{money(p.priceMinor, p.currency)}</Td>
                <Td align="right">{stock == null ? "–" : num(stock)}</Td>
                <Td align="right">{num(p._count.orderItems)}</Td>
                <Td align="right">{p.ratingCount ? `${dec(p.ratingAvg)} (${p.ratingCount})` : "–"}</Td>
                <Td className="whitespace-nowrap text-muted">{relativeTime(p.updatedAt)}</Td>
                <Td>
                  <div className="flex justify-end">
                    <Link href={`/admin/marktplatz/produkte/${p.id}`} className={manageLink}>Verwalten</Link>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={(p) => qs({ status: status ?? undefined, seite: String(p) })} />
    </>
  );
}
