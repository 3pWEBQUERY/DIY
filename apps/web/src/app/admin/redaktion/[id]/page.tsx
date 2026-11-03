import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EDITORIAL_ITEM_TYPES, type EditorialItemType } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { getCollection, resolveCollectionItems } from "@/server/admin/catalog";
import { AdminHeader } from "@/components/admin/ui";
import { CollectionEditor } from "@/components/admin/collection-editor";
import { saveCollectionAction } from "../actions";

export const metadata: Metadata = { title: "Kollektion bearbeiten" };

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await adminPage("PLATFORM_MODERATOR", `/admin/redaktion/${id}`);
  const isNew = id === "neu";
  const row = isNew ? null : await getCollection(id);
  if (!isNew && !row) notFound();
  const rawItems = (Array.isArray(row?.items) ? row.items : []) as { type?: string; id?: string }[];
  const valid = rawItems.filter((i): i is { type: EditorialItemType; id: string } => !!i.id && (EDITORIAL_ITEM_TYPES as readonly string[]).includes(i.type ?? ""));
  const items = await resolveCollectionItems(valid);

  return (
    <div>
      <Link href="/admin/redaktion" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Kollektionen
      </Link>
      <AdminHeader n="11" title={isNew ? "Neue Kollektion" : row!.title} description={isNew ? "Titel, kurzer Kontext und eine sorgfältige Auswahl – lieber 6 starke Einträge als 30 beliebige." : undefined} />
      <CollectionEditor
        id={isNew ? null : row!.id}
        action={saveCollectionAction}
        initial={{
          slug: row?.slug ?? "",
          title: row?.title ?? "",
          kicker: row?.kicker ?? "",
          description: row?.description ?? "",
          position: row?.position ?? 0,
          isActive: row?.isActive ?? true,
          season: row?.season ?? "",
          items: items.map((i) => ({ type: i.type as EditorialItemType, id: i.id, title: i.title, live: i.live })),
        }}
      />
    </div>
  );
}
