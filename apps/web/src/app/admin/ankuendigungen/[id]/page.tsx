import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ANNOUNCEMENT_PLACEMENTS, type AnnouncementPlacement } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { announcementStyleOf, getAnnouncement } from "@/server/announcements/service";
import { AdminHeader } from "@/components/admin/ui";
import { AnnouncementEditor } from "@/components/admin/announcement-editor";

export const metadata: Metadata = { title: "Ankündigung bearbeiten" };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await adminPage("ADMIN", `/admin/ankuendigungen/${id}`);
  const isNew = id === "neu";
  const row = isNew ? null : await getAnnouncement(user, id);
  if (!isNew && !row) notFound();

  return (
    <div>
      <Link href="/admin/ankuendigungen" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Ankündigungen
      </Link>
      <AdminHeader title={isNew ? "Neue Ankündigung" : row!.title} description={isNew ? "Ein wichtiger Hinweis, gut sichtbar oben auf der Seite. Wird erst gezeigt, wenn du ihn aktivierst." : undefined} />
      <AnnouncementEditor
        key={row ? `${row.id}:${row.updatedAt.getTime()}` : "neu"}
        id={row?.id ?? null}
        initial={{
          title: row?.title ?? "",
          body: row?.body ?? "",
          emoji: row?.emoji ?? "",
          ...(row
            ? announcementStyleOf(row)
            : { tone: "coral" as const, titleFont: "werkuno" as const, bodyFont: "werkuno" as const, titleSize: "m" as const, bodySize: "m" as const, textColor: "", bgMode: "tone" as const, bgColor: "", bgImageUrl: null, bgOverlay: 45, bgImageLight: "#FFFFFF", bgPosition: "center" as const }),
          bgMediaId: row?.bgMediaId ?? "",
          ctaLabel: row?.ctaLabel ?? "",
          ctaHref: row?.ctaHref ?? "",
          placements: (row?.placements ?? ["feed"]).filter((p): p is AnnouncementPlacement => (ANNOUNCEMENT_PLACEMENTS as readonly string[]).includes(p)),
          startsAt: row?.startsAt?.toISOString() ?? "",
          endsAt: row?.endsAt?.toISOString() ?? "",
          dismissible: row?.dismissible ?? true,
          isActive: row?.isActive ?? false,
          position: row?.position ?? 0,
        }}
      />
    </div>
  );
}
