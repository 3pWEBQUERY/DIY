"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { resetHiddenAction, unblockAction, unmuteAction } from "@/app/(app)/einstellungen/actions";

export function UnmuteButton({ userId, name }: { userId: string; name: string }) {
  const { run, pending } = useAction(unmuteAction);
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(userId)} aria-label={`Stummschaltung für ${name} aufheben`}>
      Wieder anzeigen
    </Button>
  );
}

export function UnblockButton({ userId, name }: { userId: string; name: string }) {
  const { run, pending } = useAction(unblockAction);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={async () => (await confirmDialog(`Blockierung von ${name} aufheben? Ihr könnt danach wieder Inhalte voneinander sehen.`)) && run(userId)}
      aria-label={`Blockierung von ${name} aufheben`}
    >
      Blockierung aufheben
    </Button>
  );
}

export function ResetHiddenButton({ count }: { count: number }) {
  const { run, pending } = useAction(resetHiddenAction);
  return (
    <Button size="sm" variant="outline" disabled={pending || count === 0} onClick={() => run()}>
      Zurücksetzen
    </Button>
  );
}
