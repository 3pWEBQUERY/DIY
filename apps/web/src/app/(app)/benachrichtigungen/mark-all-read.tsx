"use client";

import { CheckCheck } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { MoreMenu } from "@/components/social/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { deleteNotificationsAction, markAllReadAction } from "./actions";
import { adjustCounts, refreshCounts } from "@/components/shell/live-counts";

export function MarkAllRead() {
  const { run, pending } = useAction(markAllReadAction, { onSuccess: () => refreshCounts() });
  return (
    <Button variant="outline" onClick={() => { adjustCounts({ notifications: -1_000_000 }); run(); }} disabled={pending} aria-busy={pending}>
      <CheckCheck size={16} aria-hidden /> Alle gelesen
    </Button>
  );
}

/** „Gelesene löschen“ / „Alle löschen“ im Kopf des Posteingangs. */
export function DeleteNotificationsMenu({ hasRead }: { hasRead: boolean }) {
  const router = useRouter();
  const run = (which: "read" | "all") =>
    void callAction(() => deleteNotificationsAction(which)).then((r) => {
      if (r.ok) {
        if (r.message) toast(r.message);
        if (which === "all") adjustCounts({ notifications: -1_000_000 });
        refreshCounts();
        router.refresh();
      } else toast(r.error, "error");
    });
  return (
    <MoreMenu
      variant="button"
      label="Benachrichtigungen löschen"
      items={[
        ...(hasRead ? [{ label: "Gelesene löschen", onSelect: () => run("read") }] : []),
        {
          label: "Alle löschen",
          danger: true,
          onSelect: async () =>
            (await confirmDialog({ title: "Alle Benachrichtigungen löschen?", body: "Auch ungelesene werden entfernt. Das lässt sich nicht rückgängig machen.", confirmLabel: "Alle löschen", tone: "danger" })) && run("all"),
        },
      ]}
    />
  );
}
