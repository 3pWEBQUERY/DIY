import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { listOwnProjectOptions } from "@/server/projects/service";
import { getTutorialSeedFromProject } from "@/server/tutorials/service";
import { categoryOptions } from "@/server/categories/settings";
import { PageHeader } from "@/components/shell/page";
import { TutorialEditor } from "@/components/tutorials/tutorial-editor";

export const metadata = { title: "Neue Anleitung" };

/** Neue Anleitung. `?projekt=<id>` belegt Titel, Kategorie und Materialliste aus dem eigenen Projekt vor. */
export default async function NewTutorialPage({ searchParams }: { searchParams: Promise<{ projekt?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/anleitungen/neu");
  const [projects, seed] = await Promise.all([listOwnProjectOptions(user.id), sp.projekt ? getTutorialSeedFromProject(user.id, sp.projekt) : null]);

  return (
    <div className="max-w-[1180px]">
      <PageHeader
        kicker="Studio · Neue Anleitung"
        title={seed ? "Anleitung zum Projekt" : "Neue Anleitung"}
        description="Schreibe in Ruhe – veröffentlicht wird erst, wenn du so weit bist. Bis dahin bleibt alles ein Entwurf."
      />
      <TutorialEditor tutorialId={null} currentVersion={null} projects={projects} defaultProjectId={seed?.projectId ?? undefined} initial={seed ?? undefined} categories={await categoryOptions(seed?.category)} />
    </div>
  );
}
