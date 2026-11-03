import Link from "next/link";
import type { Metadata } from "next";
import { categoryBySlug } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { listCommunities } from "@/server/admin/content";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { Badge } from "@/components/ui/misc";
import { num, shortDate } from "@/components/admin/format";
import { setFeaturedAction, setHiddenAction } from "../inhalte/actions";

export const metadata: Metadata = { title: "Communities" };

const VIS: Record<string, string> = { PUBLIC: "Öffentlich", REQUEST: "Auf Anfrage", PRIVATE: "Privat" };
const STATE: Record<string, string> = { PUBLISHED: "Sichtbar", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt", DRAFT: "Entwurf" };

export default async function CommunitiesAdmin({ searchParams }: { searchParams: Promise<{ q?: string; zustand?: string; seite?: string }> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/communities");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const r = await listCommunities(user, { q: sp.q?.trim() || null, state: sp.zustand ?? null, page });

  return (
    <div>
      <AdminHeader n="07" title="Communities" description="Communities moderieren sich primär selbst. Hier werden sie hervorgehoben oder bei schweren Problemen plattformweit ausgeblendet." />
      <FilterBar>
        <FilterField label="Suche">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name oder Slug" className={`${filterInput} w-56`} />
        </FilterField>
        <FilterField label="Zustand">
          <select name="zustand" defaultValue={sp.zustand ?? ""} className={filterInput}>
            <option value="">Alle</option>
            {Object.entries(STATE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>
      <Table caption="Communities">
        <thead>
          <tr>
            <Th>Community</Th>
            <Th>Kategorie</Th>
            <Th>Zugang</Th>
            <Th>Zustand</Th>
            <Th align="right">Mitglieder</Th>
            <Th align="right">Beiträge</Th>
            <Th>Gegründet</Th>
            <Th align="right">Aktionen</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={8}>Keine Communities gefunden.</EmptyRow>}
          {r.rows.map((c) => (
            <Tr key={c.id}>
              <Td className="max-w-[280px]">
                <Link href={`/c/${c.slug}`} target="_blank" className="font-semibold hover:underline">
                  {c.name}
                </Link>
                {c.isFeatured && <Badge tone="clay" className="ml-2">Hervorgehoben</Badge>}
                <span className="block text-xs text-muted">
                  @{c.owner.profile?.handle}
                  {c.region ? ` · ${c.region}` : ""}
                </span>
              </Td>
              <Td className="whitespace-nowrap">{categoryBySlug(c.category)?.short ?? c.category}</Td>
              <Td className="whitespace-nowrap">{VIS[c.visibility]}</Td>
              <Td><Badge tone={c.state === "PUBLISHED" ? "moss" : "danger"}>{STATE[c.state]}</Badge></Td>
              <Td align="right">{num(c.memberCount)}</Td>
              <Td align="right">{num(c._count.posts)}</Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(c.createdAt)}</Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  {c.state === "PUBLISHED" && c.visibility !== "PRIVATE" && (
                    <ActionButton action={setFeaturedAction.bind(null, "COMMUNITY", c.id, !c.isFeatured)} label={c.isFeatured ? "Nicht mehr hervorheben" : "Hervorheben"} variant={c.isFeatured ? "ghost" : "outline"} />
                  )}
                  {c.state === "PUBLISHED" && <ReasonButton action={setHiddenAction.bind(null, "COMMUNITY", c.id, true)} label="Ausblenden" variant="ghost" title="Community ausblenden" description="Die Community ist danach für Nicht-Mitglieder nicht mehr auffindbar." confirmLabel="Ausblenden" />}
                  {c.state === "HIDDEN" && <ReasonButton action={setHiddenAction.bind(null, "COMMUNITY", c.id, false)} label="Wieder anzeigen" variant="ghost" title="Community wieder anzeigen" confirmLabel="Anzeigen" />}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={(p) => `/admin/communities?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.zustand ? { zustand: sp.zustand } : {}), seite: String(p) })}`} />
    </div>
  );
}
