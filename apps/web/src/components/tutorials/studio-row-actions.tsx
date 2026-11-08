"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, Pencil, Trash2 } from "lucide-react";
import { MoreMenu, type MenuItem } from "@/components/social/actions";
import { toast } from "@/components/ui/toast";
import { deleteTutorialAction, setTutorialPublishedAction } from "@/app/(app)/anleitungen/actions";

/** Zeilenaktionen im Studio: bearbeiten, zurückziehen/freigeben, löschen. */
export function TutorialRowActions({ id, title, state, hasVersion }: { id: string; title: string; state: string; hasVersion: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const run = (p: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await p();
      if (r.ok) {
        if (r.message) toast(r.message);
        router.refresh();
      } else toast(r.error ?? "Fehler", "error");
    });
  const items: MenuItem[] = [
    { label: "Bearbeiten", icon: <Pencil size={15} />, onSelect: () => router.push(`/studio/anleitungen/${id}`) },
    ...(state === "PUBLISHED"
      ? [{ label: "Zurückziehen", icon: <EyeOff size={15} />, onSelect: () => run(() => setTutorialPublishedAction(id, false)) }]
      : state === "DRAFT" && hasVersion
        ? [{ label: "Wieder veröffentlichen", icon: <Eye size={15} />, onSelect: () => run(() => setTutorialPublishedAction(id, true)) }]
        : []),
    {
      label: "Löschen",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: async () => (await confirmDialog(`«${title}» endgültig löschen? Alle Versionen und Fortschritte gehen verloren.`)) && run(() => deleteTutorialAction(id)),
    },
  ];
  return <MoreMenu items={items} label={`Aktionen für ${title}`} />;
}
