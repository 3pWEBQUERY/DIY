import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { articleBaseUrl, getArticleForEdit, listArticleCategories, myProjectOptions } from "@/server/blog/service";
import { ArticleEditor } from "@/components/blog/article-editor";

export const metadata: Metadata = { title: "Artikel bearbeiten" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/anmelden?weiter=/studio/blog/${id}`);
  const [article, categories, projects] = await Promise.all([getArticleForEdit(user, id), listArticleCategories(), myProjectOptions(user.id)]);
  if (!article) notFound();
  return <ArticleEditor key={article.id} initial={article} categories={categories} projects={projects} handle={user.profile.handle} baseUrl={articleBaseUrl()} />;
}
