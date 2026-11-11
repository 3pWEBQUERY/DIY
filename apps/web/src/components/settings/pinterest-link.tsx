"use client";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";
import { unlinkPinterestAction } from "@/app/(app)/einstellungen/actions";

/** Pinterest trennen – nur, wenn danach noch Passwort oder Apple zur Anmeldung bleibt. */
export function UnlinkPinterestButton({ canUnlink }: { canUnlink: boolean }) {
  const { run, pending } = useAction(unlinkPinterestAction);
  if (!canUnlink) return <span className="text-xs text-muted">Lege ein Passwort fest, um Pinterest trennen zu können.</span>;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        if (await confirmDialog({ title: "Pinterest trennen?", body: "Du kannst dich danach nicht mehr mit Pinterest anmelden – nur noch mit E-Mail und Passwort bzw. Apple.", confirmLabel: "Trennen" })) run();
      }}
    >
      Trennen
    </Button>
  );
}
