import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getRemixSource } from "@/server/projects/service";
import { activeCategories, categoryOptions } from "@/server/categories/settings";
import { Page, PageHeader } from "@/components/shell/page";
import { Notice } from "@/components/ui/misc";
import { ProjectEditor } from "@/components/projects/project-editor";

export const metadata: Metadata = { title: "Neues Projekt", robots: { index: false } };

/** Projekt anlegen (PRD §10.2). `?nachbau=<projectId>` startet einen Nachbau (§10.6). */
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ nachbau?: string; kategorie?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=${encodeURIComponent(`/projekte/neu${sp.nachbau ? `?nachbau=${sp.nachbau}` : ""}`)}`);
  const source = sp.nachbau ? await getRemixSource(user.id, sp.nachbau) : null;
  const defaultCategory = (await activeCategories()).find((c) => c.slug === sp.kategorie)?.slug;
  const categories = await categoryOptions(source?.category);

  return (
    <Page width="feed" className="max-w-[820px]">
      <PageHeader
        kicker={source ? "Nachbau · Neues Werkblatt" : "Neues Werkblatt"}
        title={source ? "Nachbau starten" : "Neues Projekt"}
        description={
          source
            ? "Dokumentiere deine eigene Version. Das Original bleibt verlinkt und bekommt Bescheid."
            : "Ein Projekt ist der Faden, an dem alles hängt: Journal, Anleitung, Produkte und Nachbauten."
        }
      />
      {sp.nachbau && !source && (
        <Notice tone="warn" className="mb-8">
          Das Originalprojekt ist nicht (mehr) verfügbar. Du kannst trotzdem ein eigenes Projekt anlegen.
        </Notice>
      )}
      <ProjectEditor mode="create" remixSource={source} defaultCategory={defaultCategory} categories={categories} />
    </Page>
  );
}
