import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getTutorialForEdit } from "@/server/tutorials/service";
import { listOwnProjectOptions } from "@/server/projects/service";
import { categoryOptions } from "@/server/categories/settings";
import { PageHeader } from "@/components/shell/page";
import { TutorialEditor } from "@/components/tutorials/tutorial-editor";

export const metadata = { title: "Anleitung bearbeiten" };

export default async function EditTutorialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/anmelden?weiter=/studio/anleitungen/${id}`);
  const [data, projects] = await Promise.all([getTutorialForEdit(user, id), listOwnProjectOptions(user.id)]);
  if (!data) notFound();

  return (
    <div className="max-w-[1180px]">
      <Link href="/studio/anleitungen" className="spec mb-6 inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft size={13} /> Alle Anleitungen
      </Link>
      <PageHeader kicker={data.currentVersion ? `Studio · Version ${data.currentVersion} veröffentlicht` : "Studio · Entwurf"} title={data.values.title || "Ohne Titel"} />
      <TutorialEditor key={data.id} tutorialId={data.id} slug={data.slug} initial={data.values} currentVersion={data.currentVersion} projects={projects} categories={await categoryOptions(data.values.category)} />
    </div>
  );
}
