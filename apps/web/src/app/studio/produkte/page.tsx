import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PRODUCT_KIND_LABEL, PRODUCT_STATUS_LABEL, formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { listMyProducts } from "@/server/commerce/products";
import { PageHeader, TabLinks } from "@/components/shell/page";
import { ProductRowActions } from "@/components/commerce/product-row-actions";
import { Cover } from "@/components/ui/media";
import { Badge, Empty, Notice } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Produkte" };

const TABS = [
  { key: "alle", label: "Alle", status: undefined },
  { key: "aktiv", label: "Aktiv", status: "ACTIVE" },
  { key: "entwuerfe", label: "Entwürfe", status: "DRAFT" },
  { key: "pausiert", label: "Pausiert", status: "PAUSED" },
  { key: "vergriffen", label: "Vergriffen", status: "SOLD_OUT" },
] as const;

const STATUS_TONE: Record<string, "moss" | "neutral" | "warn" | "danger" | "outline"> = { ACTIVE: "moss", DRAFT: "neutral", PAUSED: "outline", SOLD_OUT: "warn", DISABLED: "danger" };

export default async function StudioProductsPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden?weiter=/studio/produkte");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const tab = TABS.find((t) => t.key === sp.ansicht) ?? TABS[0];
  const products = await listMyProducts(user, { status: tab.status });
  const shopActive = shop.status === "ACTIVE";

  return (
    <div>
      <PageHeader
        kicker="Werkuno Studio · Marktplatz"
        title="Produkte"
        description="Deine Angebote im Marktplatz. Verknüpfe sie mit Projekten, damit Käufer:innen sehen, wie sie entstanden sind."
        actions={
          <LinkButton href="/studio/produkte/neu">
            <Plus size={16} /> Neues Produkt
          </LinkButton>
        }
      />
      {!shopActive && (
        <Notice tone="warn" className="mb-6" title="Dein Shop ist noch nicht aktiv">
          Du kannst Produkte als Entwurf vorbereiten. Veröffentlichen ist möglich, sobald die Verifizierung abgeschlossen ist. <Link href="/studio/shop" className="font-semibold underline">Status ansehen</Link>
        </Notice>
      )}
      <TabLinks active={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "alle" ? "/studio/produkte" : `/studio/produkte?ansicht=${t.key}` }))} />

      {products.length === 0 ? (
        <Empty
          className="mt-8"
          title={tab.key === "alle" ? "Noch keine Produkte" : "Hier ist nichts"}
          body={tab.key === "alle" ? "Lege dein erstes Angebot an – ein Einzelstück, ein Materialset oder eine digitale Anleitung." : undefined}
          action={tab.key === "alle" ? <LinkButton href="/studio/produkte/neu">Erstes Produkt anlegen</LinkButton> : undefined}
        />
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="spec py-3 font-normal">
                  Produkt
                </th>
                <th scope="col" className="spec py-3 font-normal">
                  Status
                </th>
                <th scope="col" className="spec py-3 text-right font-normal">
                  Preis
                </th>
                <th scope="col" className="spec py-3 text-right font-normal">
                  Bestand
                </th>
                <th scope="col" className="spec py-3 text-right font-normal">
                  Aufrufe · Gemerkt
                </th>
                <th scope="col" className="spec py-3 text-right font-normal">
                  Verkauft
                </th>
                <th scope="col" className="w-10 py-3">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const onHand = p.inventory.reduce((s, i) => s + i.onHand, 0);
                const reserved = p.inventory.reduce((s, i) => s + i.reserved, 0);
                return (
                  <tr key={p.id} className="align-middle">
                    <td className="py-3 pr-4">
                      <Link href={`/studio/produkte/${p.id}`} className="group flex items-center gap-3">
                        <div className="w-12 shrink-0 border border-line rounded-2xl">
                          <Cover url={p.coverUrl} variants={p.media[0]?.media.variants as Record<string, string> | undefined} alt="" seed={p.id} category={p.category} ratio="4/5" sizes="48px" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold group-hover:underline">{p.title}</p>
                          <p className="spec">
                            {PRODUCT_KIND_LABEL[p.kind]} · {relativeTime(p.updatedAt)}
                            {p._count.variants ? ` · ${p._count.variants} Varianten` : ""}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                      {p.status === "SOLD_OUT" && <span className="mt-1 block text-[11.5px] text-muted">{p.hideWhenSoldOut ? "Ausgeblendet" : "Sichtbar"}</span>}
                      {p.restockPendingCount > 0 && (
                        <Link href={`/studio/produkte/${p.id}`} className="mt-1 block text-[11.5px] font-semibold text-moss hover:underline">
                          {p.restockPendingCount === 1 ? "1 Anfrage" : `${p.restockPendingCount} Anfragen`} zur Nachproduktion
                        </Link>
                      )}
                    </td>
                    <td className="num py-3 text-right">{formatMoney(p.priceMinor, p.currency as Currency)}</td>
                    <td className="num py-3 text-right">
                      {p.kind === "DIGITAL" ? "∞" : onHand}
                      {reserved > 0 && <span className="block text-[11px] text-muted">{reserved} reserviert</span>}
                    </td>
                    <td className="num py-3 text-right text-muted">
                      {p.viewCount} · {p.saveCount}
                    </td>
                    <td className="num py-3 text-right">{p.orderItems.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td className="py-3 text-right">
                      <ProductRowActions id={p.id} status={p.status} kind={p.kind} hideWhenSoldOut={p.hideWhenSoldOut} href={`/markt/${shop.slug}/${p.slug}`} canDelete={p._count.orderItems === 0} shopActive={shopActive} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-[12px] text-muted">„Aufrufe“ zählt Seitenaufrufe der Produktseite (ohne deine eigenen). „Verkauft“ zählt bezahlte Stück ohne stornierte oder erstattete Bestellungen.</p>
        </div>
      )}
    </div>
  );
}
