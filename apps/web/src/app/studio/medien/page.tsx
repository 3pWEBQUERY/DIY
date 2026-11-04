import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { listMedia } from "@/server/analytics/studio";
import { Segments } from "@/components/admin/ui";
import { bytes, num, shortDate } from "@/components/admin/format";
import { MediaGrid } from "@/components/creator/media-grid";
import { Empty } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Medienbibliothek" };

const FILTERS = [
  { key: "all", label: "Alle" },
  { key: "images", label: "Bilder" },
  { key: "videos", label: "Videos" },
  { key: "files", label: "Dateien" },
  { key: "unused", label: "Unbenutzt" },
] as const;

export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/medien");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter)?.key ?? "all";
  const lib = await listMedia(user.id, filter);
  const missingAlt = lib.items.filter((i) => i.kind === "IMAGE" && !i.alt).length;

  return (
    <div className="max-w-[1200px]">
      <header className="mb-8">
        <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />{num(lib.count)} Dateien · {bytes(lib.totalBytes)}</p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Medienbibliothek</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Alle Fotos, Videos und Dateien, die du hochgeladen hast. Gute Alt-Texte machen deine Projekte für Menschen mit Screenreader zugänglich. Unbenutzte Dateien kannst du hier löschen; verwendete entfernst du im jeweiligen Inhalt.
        </p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segments active={filter} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "all" ? "/studio/medien" : `/studio/medien?filter=${f.key}` }))} />
        {missingAlt > 0 && <p className="mb-5 text-[13px] text-warn">{missingAlt} Bilder ohne Alt-Text</p>}
      </div>
      {lib.items.length === 0 ? (
        <Empty title={filter === "unused" ? "Keine unbenutzten Dateien" : "Noch keine Medien"} body={filter === "unused" ? "Alles, was du hochgeladen hast, ist in Verwendung." : "Medien lädst du direkt beim Erstellen von Beiträgen, Projekten oder Produkten hoch."} />
      ) : (
        <MediaGrid
          items={lib.items.map((m) => ({
            id: m.id,
            kind: m.kind,
            state: m.state,
            mime: m.mime,
            size: bytes(m.bytes),
            dims: m.width && m.height ? `${m.width}×${m.height}` : null,
            preview: m.preview,
            isPrivate: m.isPrivate,
            alt: m.alt,
            created: shortDate(m.createdAt),
            attached: m.attached,
            usedIn: m.usedIn,
          }))}
        />
      )}
    </div>
  );
}
