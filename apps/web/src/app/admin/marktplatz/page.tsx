import Link from "next/link";
import type { Metadata } from "next";
import { adminPage } from "@/server/admin/guard";
import { listShops } from "@/server/admin/content";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ReasonButton } from "@/components/admin/action-controls";
import { Badge } from "@/components/ui/misc";
import { dec, num, shortDate } from "@/components/admin/format";
import { decideShopAction } from "./actions";

export const metadata: Metadata = { title: "Marktplatz & Verkäufer" };

const STATUS: Record<string, string> = { DRAFT: "Entwurf", PENDING_VERIFICATION: "Prüfung ausstehend", ACTIVE: "Aktiv", PAUSED: "Pausiert", SUSPENDED: "Gesperrt" };
const VERIF: Record<string, string> = { NOT_STARTED: "nicht gestartet", PENDING: "beim Provider", VERIFIED: "verifiziert", REJECTED: "abgelehnt" };
const tone = (s: string) => (s === "ACTIVE" ? "moss" : s === "PENDING_VERIFICATION" ? "warn" : s === "SUSPENDED" ? "danger" : "neutral") as "moss" | "warn" | "danger" | "neutral";

export default async function MarketAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; seite?: string }> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/marktplatz");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const status = sp.status && sp.status in STATUS ? sp.status : null;
  const r = await listShops(user, { status, q: sp.q?.trim() || null, page });

  return (
    <div>
      <AdminHeader
        n="08"
        title="Marktplatz & Verkäufer"
        description="Shops prüfen und freigeben. Nur echtes Handgemachtes, Materialsets und eigene Anleitungen – kein Dropshipping, keine Massenware (Marktplatz-Richtlinien). Auszahlungen und Zahlungsdaten sind hier bewusst nicht sichtbar."
      />
      <Segments
        active={status ?? "ALL"}
        items={[
          { key: "ALL", label: "Alle", href: "/admin/marktplatz" },
          ...Object.entries(STATUS).map(([k, v]) => ({ key: k, label: v, href: `/admin/marktplatz?status=${k}`, count: r.byStatus[k] ?? 0 })),
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
            <Th>Zahlungen</Th>
            <Th align="right">Produkte</Th>
            <Th align="right">Bewertung</Th>
            <Th>Seit</Th>
            <Th align="right">Entscheidung</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={9}>Keine Shops in dieser Ansicht.</EmptyRow>}
          {r.rows.map((s) => (
            <Tr key={s.id} highlight={s.status === "PENDING_VERIFICATION"}>
              <Td className="max-w-[260px]">
                <Link href={`/markt/${s.slug}`} target="_blank" className="font-semibold hover:underline">
                  {s.name}
                </Link>
                <span className="block text-xs text-muted">
                  <Link href={`/admin/nutzer/${s.owner.id}`} className="hover:underline">@{s.owner.profile?.handle}</Link> · {s.country}
                </span>
              </Td>
              <Td className="whitespace-nowrap">{s.sellerType === "BUSINESS" ? "Gewerblich" : "Privat"}</Td>
              <Td><Badge tone={tone(s.status)}>{STATUS[s.status]}</Badge></Td>
              <Td className="whitespace-nowrap text-[13px]">
                {VERIF[s.verification?.state ?? "NOT_STARTED"]}
                {s.verification?.businessName && <span className="block text-xs text-muted">{s.verification.businessName}</span>}
              </Td>
              <Td className="whitespace-nowrap text-[13px]">
                <span className={s.chargesEnabled ? "text-moss" : "text-muted"}>{s.chargesEnabled ? "Zahlungen ✓" : "Zahlungen –"}</span>
                <span className={`ml-2 ${s.payoutsEnabled ? "text-moss" : "text-muted"}`}>{s.payoutsEnabled ? "Auszahlung ✓" : "Auszahlung –"}</span>
              </Td>
              <Td align="right">{num(s._count.products)}</Td>
              <Td align="right">{s.ratingCount ? `${dec(s.ratingAvg)} (${s.ratingCount})` : "–"}</Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(s.createdAt)}</Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  {(s.status === "PENDING_VERIFICATION" || s.status === "DRAFT") && (
                    <ReasonButton action={decideShopAction.bind(null, s.id, "APPROVE")} label="Freigeben" variant="primary" confirmVariant="primary" title={`„${s.name}“ freigeben`} description="Manuelle Freigabe nach Prüfung von Identität, Angebot und Richtlinien. Die Prüfung wird protokolliert." reasonLabel="Prüfnotiz" confirmLabel="Shop freigeben" />
                  )}
                  {s.status === "ACTIVE" && <ReasonButton action={decideShopAction.bind(null, s.id, "PAUSE")} label="Pausieren" variant="ghost" title="Shop pausieren" confirmLabel="Pausieren" />}
                  {(s.status === "PAUSED" || s.status === "SUSPENDED") && <ReasonButton action={decideShopAction.bind(null, s.id, "REACTIVATE")} label="Reaktivieren" variant="outline" title="Shop reaktivieren" confirmLabel="Reaktivieren" />}
                  {s.status !== "SUSPENDED" && s.status !== "DRAFT" && (
                    <ReasonButton action={decideShopAction.bind(null, s.id, "SUSPEND")} label="Sperren" variant="ghost" confirmVariant="danger" title="Shop sperren" description="Alle aktiven Produkte werden pausiert und sind nicht mehr kaufbar. Offene Bestellungen bleiben bestehen." confirmLabel="Shop sperren" />
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={(p) => `/admin/marktplatz?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}), seite: String(p) })}`} />
    </div>
  );
}
