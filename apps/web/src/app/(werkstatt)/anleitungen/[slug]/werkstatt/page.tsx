import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getTutorialPage } from "@/server/tutorials/service";
import { WorkshopMode } from "@/components/tutorials/workshop-mode";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  return { title: t ? `${t.title} – Werkstatt-Modus` : "Anleitung nicht gefunden", robots: { index: false, follow: false } };
}

/** Werkstatt-Modus: eine Anleitung Schritt für Schritt im Vollbild, für die Arbeit an der Werkbank. */
export default async function TutorialWorkshopPage({ params }: Props) {
  const { slug } = await params;
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  if (!t) notFound();
  // Exklusive Anleitung ohne Unterstützung → zur Anleitung mit dem Angebot
  if (t.locked) redirect(t.href);
  return (
    <WorkshopMode
      tutorial={{ id: t.id, title: t.title, href: t.href, materials: t.materials, tools: t.tools }}
      steps={t.steps}
      completedKeys={t.viewer.completedKeys}
      completedAt={t.viewer.completedAt}
      signedIn={t.viewer.signedIn}
      preview={t.preview}
    />
  );
}
