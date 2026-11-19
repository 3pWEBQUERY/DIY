import Link from "next/link";
import type { Metadata } from "next";
import { ANNOUNCEMENT_PLACEMENT_LABEL, ANNOUNCEMENT_STATUS_LABEL, announcementColors, announcementStatus, type AnnouncementPlacement } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { announcementStyleOf, listAnnouncements } from "@/server/announcements/service";
import { AdminHeader, EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/action-controls";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { dateTime } from "@/components/admin/format";
import { EMOJI_FONT } from "@/components/ui/emoji-picker";
import { deleteAnnouncementAction, toggleAnnouncementAction } from "./actions";

export const metadata: Metadata = { title: "Ankündigungen" };

const STATUS_TONE = { draft: "neutral", scheduled: "outline", live: "moss", ended: "neutral" } as const;

export default async function AnnouncementsPage() {
  const user = await adminPage("ADMIN", "/admin/ankuendigungen");
  const rows = await listAnnouncements(user);
  const now = new Date();
  return (
    <div>
      <AdminHeader
        title="Ankündigungen"
        description="Wichtige Hinweise als Mini-Hero oben auf Werkbank, Startseite, Marktplatz oder Entdecken. Pro Seite erscheint die laufende Ankündigung mit der kleinsten Reihenfolge-Zahl; ausgeblendete überspringt der Browser, bis sie geändert werden."
        actions={<LinkButton href="/admin/ankuendigungen/neu" variant="ink" size="sm">Neue Ankündigung</LinkButton>}
      />
      <Table caption="Ankündigungen">
        <thead>
          <tr>
            <Th align="right">Pos.</Th>
            <Th>Ankündigung</Th>
            <Th>Seiten</Th>
            <Th>Zeitraum</Th>
            <Th>Status</Th>
            <Th align="right">Aktionen</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={6}>Noch keine Ankündigungen. Lege die erste an – sie bleibt ein Entwurf, bis du sie aktivierst.</EmptyRow>}
          {rows.map((a) => {
            const status = announcementStatus(a, now);
            const style = announcementStyleOf(a);
            const c = announcementColors(style);
            return (
              <Tr key={a.id}>
                <Td align="right" mono>{a.position}</Td>
                <Td>
                  <span className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-cover bg-center text-[15px]"
                      style={{ backgroundColor: c.bg, backgroundImage: c.image ? `linear-gradient(rgba(38,36,39,${c.overlay}),rgba(38,36,39,${c.overlay})), url(${JSON.stringify(style.bgImageUrl)})` : undefined, color: c.fg, fontFamily: EMOJI_FONT }}
                    >
                      {a.emoji || "·"}
                    </span>
                    <span className="min-w-0">
                      <Link href={`/admin/ankuendigungen/${a.id}`} className="font-semibold hover:underline">{a.title}</Link>
                      <span className="block text-[12px] text-muted">
                        Geändert {dateTime(a.updatedAt)}
                        {a.updatedBy?.profile?.displayName ? ` von ${a.updatedBy.profile.displayName}` : ""}
                      </span>
                    </span>
                  </span>
                </Td>
                <Td className="text-[13px] text-ink-2">{a.placements.map((p) => ANNOUNCEMENT_PLACEMENT_LABEL[p as AnnouncementPlacement]?.label ?? p).join(", ")}</Td>
                <Td className="whitespace-nowrap text-[13px] text-muted">
                  {a.startsAt || a.endsAt ? (
                    <>
                      {a.startsAt ? dateTime(a.startsAt) : "sofort"} – {a.endsAt ? dateTime(a.endsAt) : "offen"}
                    </>
                  ) : (
                    "Ohne Zeitraum"
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[status]}>{ANNOUNCEMENT_STATUS_LABEL[status]}</Badge>
                </Td>
                <Td>
                  <span className="flex justify-end gap-1.5">
                    <LinkButton href={`/admin/ankuendigungen/${a.id}`} variant="ghost" size="sm">Bearbeiten</LinkButton>
                    <ActionButton action={toggleAnnouncementAction.bind(null, a.id, !a.isActive)} label={a.isActive ? "Ausschalten" : "Aktivieren"} />
                    <ActionButton action={deleteAnnouncementAction.bind(null, a.id)} label="Löschen" variant="ghost" confirm={`Ankündigung „${a.title}“ endgültig löschen?`} />
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
