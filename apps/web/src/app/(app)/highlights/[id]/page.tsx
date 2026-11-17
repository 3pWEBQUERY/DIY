import type { Metadata } from "next";
import { currentUser } from "@/server/auth/session";
import { highlightGroup } from "@/server/stories/highlights";
import { StoryViewer } from "@/components/stories/story-viewer";
import { StoryGone } from "@/components/stories/story-gone";

type Params = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Highlight", robots: { index: false, follow: false } };

/** Highlight eines Profils im Story-Betrachter. */
export default async function HighlightPage({ params }: Params) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  const group = await highlightGroup(user?.id ?? null, id);
  if (!group) return <StoryGone highlight />;
  return <StoryViewer key={group.key} initial={group} sequence={[group.author.handle]} viewer={user?.profile ? { id: user.id, handle: user.profile.handle } : null} />;
}
