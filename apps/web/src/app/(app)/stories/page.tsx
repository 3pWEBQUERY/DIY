import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storyArchive } from "@/server/stories/service";
import { myHighlights } from "@/server/stories/highlights";
import { Page, PageHeader } from "@/components/shell/page";
import { StoryArchive } from "@/components/stories/story-archive";

export const metadata: Metadata = { title: "Deine Stories", robots: { index: false } };

/** Eigene Stories: neue Story, Archiv und Highlights fürs Profil. */
export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/stories");
  const u = user as typeof user & { profile: NonNullable<typeof user.profile> };
  const [archive, highlights, projects] = await Promise.all([
    storyArchive(u),
    myHighlights(u),
    db.project.findMany({ where: { ownerId: u.id, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } }),
  ]);
  return (
    <Page width="wide">
      <PageHeader
        kicker="Werkbank"
        title="Deine Stories"
        description="Stories sind 24 Stunden im Story-Kreis deiner Follower. Danach bleiben sie hier im Archiv – nur für dich – und du kannst sie zu Highlights für dein Profil bündeln."
      />
      <StoryArchive handle={u.profile.handle} initial={archive.items} cursor={archive.nextCursor} highlights={highlights} projects={projects} openComposer={sp.neu === "1"} />
    </Page>
  );
}
