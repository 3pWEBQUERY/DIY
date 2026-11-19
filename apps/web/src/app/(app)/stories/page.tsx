import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storyArchive } from "@/server/stories/service";
import { myHighlights } from "@/server/stories/highlights";
import { flagEnabled } from "@/server/flags";
import { Page, PageHeader } from "@/components/shell/page";
import { StoryArchive } from "@/components/stories/story-archive";
import { flatSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Deine Stories", robots: { index: false } };

/** Eigene Stories: neue Story, Archiv und Highlights fürs Profil. */
export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ neu?: string | string[] }> }) {
  const sp = flatSearchParams(await searchParams);
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/stories");
  const u = user as typeof user & { profile: NonNullable<typeof user.profile> };
  const [archive, highlights, projectRows, designTools] = await Promise.all([
    storyArchive(u),
    myHighlights(u),
    db.project.findMany({ where: { ownerId: u.id, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, state: true, visibility: true } }),
    flagEnabled("stories.editor", u.id),
  ]);
  const projects = projectRows.map((p) => ({ id: p.id, title: p.title, public: p.state === "PUBLISHED" && p.visibility === "PUBLIC" }));
  return (
    <Page width="wide">
      <PageHeader
        kicker="Werkbank"
        title="Deine Stories"
        description="Stories sind 24 Stunden im Story-Kreis deiner Follower. Danach bleiben sie hier im Archiv – nur für dich – und du kannst sie zu Highlights für dein Profil bündeln."
      />
      <StoryArchive handle={u.profile.handle} initial={archive.items} cursor={archive.nextCursor} highlights={highlights} projects={projects} designTools={designTools} openComposer={sp.neu === "1"} />
    </Page>
  );
}
