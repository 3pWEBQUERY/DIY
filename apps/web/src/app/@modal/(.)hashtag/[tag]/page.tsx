import { notFound } from "next/navigation";
import { HashtagOverlay } from "@/components/hashtags/hashtag-overlay";
import { HashtagView } from "@/components/hashtags/hashtag-view";
import { loadHashtagView } from "../../../(app)/hashtag/[tag]/load";

/** Hashtag aus der App heraus geöffnet: als Fenster über der aktuellen Seite. */
export default async function HashtagModal({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<{ typ?: string | string[] }> }) {
  const { page, viewer } = await loadHashtagView(params, searchParams);
  if (!page) notFound();
  return (
    <HashtagOverlay title={`#${page.tag.display}`}>
      <HashtagView page={page} viewer={viewer} overlay />
    </HashtagOverlay>
  );
}
