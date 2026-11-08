import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { requirePageUser } from "@/server/auth/session";
import { getPostForEdit } from "@/server/social/posts";
import { listOwnProjectOptions } from "@/server/projects/service";
import { categoryOptions } from "@/server/categories/settings";
import { AppError } from "@/server/errors";
import { Stat } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { PostEditor } from "./post-editor";

export const metadata = { title: "Beitrag bearbeiten" };

/** Studio: einen Beitrag verwalten – bearbeiten, verknüpfen, löschen (§20.2). */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser("/studio/inhalte");
  let post;
  try {
    post = await getPostForEdit(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const projects = await listOwnProjectOptions(user.id);

  return (
    <div className="max-w-5xl">
      <Link href="/studio/inhalte" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Meine Inhalte
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="spec">
            {post.state === "DRAFT"
              ? post.scheduledAt
                ? `Beitrag · geplant für ${formatDate(post.scheduledAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
                : "Beitrag · Entwurf"
              : `Beitrag · veröffentlicht am ${formatDate(post.publishedAt)}${post.editedAt ? ` · zuletzt bearbeitet ${formatDate(post.editedAt)}` : ""}`}
          </p>
          <h1 className="display mt-2 text-4xl">{post.state === "DRAFT" ? "Entwurf bearbeiten" : "Beitrag bearbeiten"}</h1>
          {post.community && (
            <p className="mt-2 text-sm text-muted">
              Erschienen in der Community <Link href={`/c/${post.community.slug}`} className="font-semibold text-ink underline underline-offset-2">{post.community.name}</Link>
            </p>
          )}
        </div>
        <Link href={`/beitrag/${post.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss hover:underline">
          {post.state === "DRAFT" ? "Vorschau" : "Öffentliche Ansicht"} <ArrowUpRight size={14} />
        </Link>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
        <PostEditor post={post} projects={projects.map((p) => ({ id: p.id, title: p.title }))} categories={await categoryOptions(post.category)} />
        {post.state === "DRAFT" ? (
          <aside className="space-y-3 text-xs leading-relaxed text-muted" aria-label="Hinweise">
            <p className="spec text-ink">Entwurf</p>
            <p>Nur du siehst diesen Beitrag. Follower und erwähnte Personen werden erst bei der Veröffentlichung benachrichtigt.</p>
            <p>Eine Umfrage läuft ab dem Moment der Veröffentlichung.</p>
          </aside>
        ) : (
          <aside className="space-y-6" aria-label="Kennzahlen">
            <p className="spec text-ink">Resonanz</p>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
              <Stat label="Gefällt-mir" value={post.counts.likes} />
              <Stat label="Kommentare" value={post.counts.comments} />
              <Stat label="Gespeichert" value={post.counts.saves} />
              <Stat label="Geteilt" value={post.counts.reposts} />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Änderungen sind sofort sichtbar und werden als „bearbeitet“ gekennzeichnet. Kommentare bleiben erhalten.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
