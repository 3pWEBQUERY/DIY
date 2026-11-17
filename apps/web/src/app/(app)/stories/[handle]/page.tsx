import type { Metadata } from "next";
import { currentUser } from "@/server/auth/session";
import { storyGroup, storySequence } from "@/server/stories/service";
import { StoryViewer } from "@/components/stories/story-viewer";
import { StoryGone } from "@/components/stories/story-gone";

type Params = { params: Promise<{ handle: string }>; searchParams: Promise<{ story?: string }> };

export const metadata: Metadata = { title: "Stories", robots: { index: false, follow: false } };

/** Story-Betrachter im Vollbild – vom Story-Kreis, vom Profil oder per geteiltem Link. */
export default async function StoryPage({ params, searchParams }: Params) {
  const [{ handle }, sp, user] = await Promise.all([params, searchParams, currentUser()]);
  const [group, sequence] = await Promise.all([storyGroup(user?.id ?? null, handle, { focusId: sp.story ?? null }), storySequence(user, handle)]);
  if (!group) return <StoryGone handle={handle} />;
  return (
    <StoryViewer
      key={`${group.key}:${sp.story ?? ""}`}
      initial={group}
      sequence={sequence[0] === group.author.handle ? sequence : [group.author.handle, ...sequence.slice(1)]}
      viewer={user?.profile ? { id: user.id, handle: user.profile.handle } : null}
    />
  );
}
