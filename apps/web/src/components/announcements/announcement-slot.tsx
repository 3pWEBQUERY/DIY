import type { AnnouncementPlacement } from "@werkraum/shared";
import { activeAnnouncements } from "@/server/announcements/service";
import { AnnouncementBanner } from "./announcement-banner";

/** Platz für Ankündigungen auf einer Seite (Server): lädt die laufenden, zeigt die wichtigste. */
export async function AnnouncementSlot({ placement, className }: { placement: AnnouncementPlacement; className?: string }) {
  const items = await activeAnnouncements(placement);
  if (!items.length) return null;
  return <AnnouncementBanner items={items} className={className} />;
}
