"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreMenu, type MenuItem } from "@/components/social/actions";
import { toast } from "@/components/ui/toast";
import { deleteProductAction, setProductStatusAction } from "@/app/studio/produkte/actions";

/** Schnellaktionen in der Produkttabelle (Status, Ansehen, Löschen). */
export function ProductRowActions({ id, status, href, canDelete, shopActive }: { id: string; status: string; href: string; canDelete: boolean; shopActive: boolean }) {
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
  const items: MenuItem[] = [{ label: "Bearbeiten", onSelect: () => router.push(`/studio/produkte/${id}`) }];
  if (status === "ACTIVE" || status === "SOLD_OUT") items.push({ label: "Im Marktplatz ansehen", onSelect: () => router.push(href) });
  if (status === "ACTIVE" || status === "SOLD_OUT") items.push({ label: "Pausieren", onSelect: () => run(() => setProductStatusAction(id, "PAUSED")) });
  if ((status === "PAUSED" || status === "DRAFT") && shopActive) items.push({ label: "Veröffentlichen", onSelect: () => run(() => setProductStatusAction(id, "ACTIVE")) });
  if (canDelete)
    items.push({
      label: "Löschen",
      danger: true,
      onSelect: () => confirm("Produkt endgültig löschen?") && run(() => deleteProductAction(id)),
    });
  if (status === "DISABLED") return <span className="spec">Gesperrt</span>;
  return <MoreMenu items={items} label="Aktionen" />;
}
