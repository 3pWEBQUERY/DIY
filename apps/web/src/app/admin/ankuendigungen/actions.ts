"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { deleteAnnouncement, saveAnnouncement, setAnnouncementActive } from "@/server/announcements/service";

/** Seiten mit Ankündigungen sofort neu aufbauen (die Startseite ist sonst bis zu 5 Minuten zwischengespeichert) */
function refresh() {
  revalidatePath("/admin/ankuendigungen");
  for (const p of ["/", "/feed", "/markt", "/entdecken"]) revalidatePath(p);
}

export async function saveAnnouncementAction(id: string | null, input: unknown) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const row = await saveAnnouncement(u, id, input);
    refresh();
    return { id: row.id };
  }, "Ankündigung gespeichert.");
}

export async function toggleAnnouncementAction(id: string, active: boolean) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await setAnnouncementActive(u, id, active);
    refresh();
    return null;
  }, active ? "Ankündigung ist aktiv." : "Ankündigung ist ausgeschaltet.");
}

export async function deleteAnnouncementAction(id: string) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await deleteAnnouncement(u, id);
    refresh();
    return null;
  }, "Ankündigung gelöscht.");
}
