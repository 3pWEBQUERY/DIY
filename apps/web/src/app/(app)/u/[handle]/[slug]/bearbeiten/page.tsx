import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getProjectForEdit } from "@/server/projects/service";
import { categoryOptions } from "@/server/categories/settings";
import { Page, PageHeader } from "@/components/shell/page";
import { ProjectEditor } from "@/components/projects/project-editor";

export const metadata: Metadata = { title: "Projekt bearbeiten", robots: { index: false } };

export default async function EditProjectPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=${encodeURIComponent(`/u/${handle}/${slug}/bearbeiten`)}`);
  const data = await getProjectForEdit(user, handle, slug);
  if (!data) notFound();

  return (
    <Page width="feed" className="max-w-[820px]">
      <Link href={data.href} className="spec mb-6 inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft size={13} /> Zurück zum Projekt
      </Link>
      <PageHeader kicker="Werkblatt bearbeiten" title={data.values.title} />
      <ProjectEditor mode="edit" projectId={data.id} initial={data.values} remixOf={data.remixOf} categories={await categoryOptions(data.values.category)} />
    </Page>
  );
}
