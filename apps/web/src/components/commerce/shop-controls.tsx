"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { refreshStripeAction, setShopPausedAction, simulateVerificationAction, startOnboardingAction } from "@/app/studio/shop/actions";
import { callAction } from "@/lib/use-action";

/** Weiter zu Stripe Connect (Express) – Konto wird bei Bedarf serverseitig angelegt. */
export function StripeOnboardingButton({ label = "Auszahlungskonto verbinden" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await callAction(() => startOnboardingAction());
          if (r.ok) window.location.assign(r.data.url);
          else toast(r.error, "error");
        })
      }
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
      {label}
    </Button>
  );
}

/** Status bei Stripe abfragen; `auto` fragt einmal automatisch nach der Rückkehr aus dem Onboarding. */
export function RefreshStripeButton({ auto }: { auto?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const done = useRef(false);
  const run = () =>
    start(async () => {
      const r = await callAction(() => refreshStripeAction());
      if (r.ok) {
        if (r.data.status === "ACTIVE") toast("Dein Shop ist verifiziert und aktiv.");
        router.refresh();
      } else toast(r.error, "error");
    });
  useEffect(() => {
    if (auto && !done.current) {
      done.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={run}>
      <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> Status aktualisieren
    </Button>
  );
}

export function SimulateVerificationButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await callAction(() => simulateVerificationAction());
          if (r.ok) {
            toast(r.message ?? "Verifiziert.");
            router.refresh();
          } else toast(r.error, "error");
        })
      }
    >
      Verifizierung simulieren (Testmodus)
    </Button>
  );
}

export function PauseShopButton({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={paused ? "primary" : "outline"}
      disabled={pending}
      onClick={async () => {
        if (!paused && !(await confirmDialog("Shop pausieren? Deine Produkte bleiben sichtbar, können aber nicht gekauft werden. Offene Bestellungen sind nicht betroffen."))) return;
        start(async () => {
          const r = await callAction(() => setShopPausedAction(!paused));
          if (r.ok) {
            toast(r.message ?? "Gespeichert.");
            router.refresh();
          } else toast(r.error, "error");
        });
      }}
    >
      {paused ? "Shop wieder öffnen" : "Shop pausieren"}
    </Button>
  );
}
