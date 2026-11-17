"use client";

import { useRouter } from "next/navigation";
import { ContentEditForm, type ContentEditValues } from "@/components/admin/content-admin";
import { LinkButton } from "@/components/ui/button";

type Option = { value: string; label: string };

/** Projekt bearbeiten als eigene Seite: nach dem Speichern zurück zur Projektübersicht im Admin. */
export function ProjectEditForm({
  id,
  values,
  categories,
  visibilities,
  difficulties,
}: {
  id: string;
  values: ContentEditValues;
  categories: Option[];
  visibilities: Option[];
  difficulties: Option[];
}) {
  const router = useRouter();
  const back = `/admin/inhalte/projekte/${id}`;
  return (
    <ContentEditForm
      kind="PROJECT"
      id={id}
      values={values}
      categories={categories}
      visibilities={visibilities}
      difficulties={difficulties}
      withTags
      onSaved={() => {
        router.push(back);
        router.refresh();
      }}
      cancel={
        <LinkButton href={back} variant="ghost">
          Abbrechen
        </LinkButton>
      }
    />
  );
}
