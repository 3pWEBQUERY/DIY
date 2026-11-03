import Link from "next/link";
import type { Metadata } from "next";
import { adminPage } from "@/server/admin/guard";
import { listCollections } from "@/server/admin/catalog";
import { AdminHeader, EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/action-controls";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { shortDate } from "@/components/admin/format";
import { deleteCollectionAction, toggleCollectionAction } from "./actions";

export const metadata: Metadata = { title: "Redaktion" };

export default async function EditorialPage() {
  await adminPage("PLATFORM_MODERATOR", "/admin/redaktion");
  const rows = await listCollections();
  return (
    <div>
      <AdminHeader
        n="11"
        title="Redaktion"
        description="Kuratierte Kollektionen für „Entdecken“ – Saisonthemen, Einsteigerprojekte, besondere Anleitungen. Aktive Kollektionen erscheinen in der Reihenfolge ihrer Position."
        actions={<LinkButton href="/admin/redaktion/neu" variant="ink" size="sm">Neue Kollektion</LinkButton>}
      />
      <Table caption="Redaktionelle Kollektionen">
        <thead>
          <tr>
            <Th align="right">Pos.</Th>
            <Th>Kollektion</Th>
            <Th>Saison</Th>
            <Th align="right">Einträge</Th>
            <Th>Status</Th>
            <Th>Aktualisiert</Th>
            <Th align="right">Aktionen</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={7}>Noch keine Kollektionen. Lege die erste an – sie erscheint sofort auf „Entdecken“.</EmptyRow>}
          {rows.map((c) => (
            <Tr key={c.id}>
              <Td align="right" mono>{c.position}</Td>
              <Td>
                {c.kicker && <span className="spec block">{c.kicker}</span>}
                <Link href={`/admin/redaktion/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                <span className="block font-mono text-[11px] text-muted">{c.slug}</span>
              </Td>
              <Td className="text-muted">{c.season ?? "–"}</Td>
              <Td align="right">{Array.isArray(c.items) ? c.items.length : 0}</Td>
              <Td><Badge tone={c.isActive ? "moss" : "neutral"}>{c.isActive ? "Aktiv" : "Inaktiv"}</Badge></Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(c.updatedAt)}</Td>
              <Td>
                <span className="flex justify-end gap-1.5">
                  <LinkButton href={`/admin/redaktion/${c.id}`} variant="ghost" size="sm">Bearbeiten</LinkButton>
                  <ActionButton action={toggleCollectionAction.bind(null, c.id, !c.isActive)} label={c.isActive ? "Deaktivieren" : "Aktivieren"} />
                  <ActionButton action={deleteCollectionAction.bind(null, c.id)} label="Löschen" variant="ghost" confirm={`Kollektion „${c.title}“ endgültig löschen?`} />
                </span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
