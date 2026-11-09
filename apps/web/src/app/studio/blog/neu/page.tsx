import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";
import { articleBaseUrl, listArticleCategories, myProjectOptions } from "@/server/blog/service";
import { ArticleEditor } from "@/components/blog/article-editor";

export const metadata: Metadata = { title: "Neuer Artikel" };

export default async function NewArticlePage() {
  const user = await requirePageUser("/studio/blog/neu").catch(() => null);
  if (!user) redirect("/anmelden?weiter=/studio/blog/neu");
  const [categories, projects] = await Promise.all([listArticleCategories(), myProjectOptions(user.id)]);
  return (
    <>
      <h1 className="sr-only">Neuer Artikel</h1>
      <ArticleEditor initial={null} categories={categories} projects={projects} handle={user.profile.handle} baseUrl={articleBaseUrl()} />
    </>
  );
}
