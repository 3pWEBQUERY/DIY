import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHashtagPage, parseHashtagParam } from "@/server/hashtags/service";
import { Page } from "@/components/shell/page";
import { HashtagView } from "@/components/hashtags/hashtag-view";
import { loadHashtagView } from "./load";

type Props = { params: Promise<{ tag: string }>; searchParams: Promise<{ typ?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const name = parseHashtagParam(tag);
  if (!name) return { title: "Hashtag" };
  const page = await getHashtagPage(name);
  const display = page?.tag.display ?? name;
  return {
    title: `#${display}`,
    description: `Beiträge, Projekte und Anleitungen mit #${display} auf Werkuno.`,
    alternates: { canonical: `/hashtag/${encodeURIComponent(name)}` },
    // Leere Hashtag-Seiten nicht indexieren
    robots: page && page.total > 0 ? undefined : { index: false },
  };
}

/** Hashtag als eigene Seite (direkter Aufruf, neuer Tab, geteilter Link). */
export default async function HashtagPage({ params, searchParams }: Props) {
  const { page, viewer } = await loadHashtagView(params, searchParams);
  if (!page) notFound();
  return (
    <Page width="wide">
      <HashtagView page={page} viewer={viewer} />
    </Page>
  );
}
