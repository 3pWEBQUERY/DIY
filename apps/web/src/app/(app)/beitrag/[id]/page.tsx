import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getPostForViewer } from "@/server/social/posts";
import { Page } from "@/components/shell/page";
import { PostCard } from "@/components/social/post-card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPostForViewer(id, null);
  if (!p) return { title: "Beitrag", robots: { index: false } };
  const img = p.media[0]?.variants?.lg;
  return {
    title: `${p.author.displayName}: „${p.body.slice(0, 60) || "Beitrag"}“`,
    description: p.body.slice(0, 160),
    alternates: { canonical: `/beitrag/${id}` },
    openGraph: { type: "article", images: img ? [img] : undefined },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const post = await getPostForViewer(id, user?.id ?? null);
  if (!post) notFound();
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl } : null;
  return (
    <Page>
      <Link href="/feed" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Zurück
      </Link>
      <PostCard post={post} viewer={viewer} defaultOpenComments />
    </Page>
  );
}
