"use client";

import { LogOut } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { revokeOtherSessionsAction, revokeSessionAction, signOutAction } from "@/app/(app)/einstellungen/actions";

export function RevokeSessionButton({ sessionKey, device }: { sessionKey: string; device: string }) {
  const { run, pending } = useAction(revokeSessionAction);
  return (
    <Button size="sm" variant="ghost" onClick={() => run(sessionKey)} disabled={pending} aria-label={`Sitzung „${device}“ beenden`}>
      Beenden
    </Button>
  );
}

export function RevokeOthersButton({ count }: { count: number }) {
  const { run, pending } = useAction(revokeOtherSessionsAction);
  return (
    <Button
      variant="outline"
      disabled={pending || count === 0}
      onClick={() => {
        if (window.confirm(`${count} andere Sitzung${count === 1 ? "" : "en"} beenden?`)) run();
      }}
    >
      Alle anderen abmelden
    </Button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut size={14} aria-hidden /> Abmelden
      </Button>
    </form>
  );
}
