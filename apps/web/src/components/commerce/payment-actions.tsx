"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { abandonOrderAction, resumePaymentAction, simulatePaymentAction } from "@/app/(app)/markt/actions";

function go(router: ReturnType<typeof useRouter>, url: string) {
  if (/^https?:\/\//.test(url)) window.location.assign(url);
  else router.push(url);
}

/** „Jetzt bezahlen“ für eine offene Bestellung (z. B. die zweite von mehreren Shops). */
export function ResumePaymentButton({ orderId, label = "Jetzt bezahlen", variant = "primary" }: { orderId: string; label?: string; variant?: "primary" | "outline" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resumePaymentAction(orderId);
          if (r.ok) go(router, r.data.url);
          else {
            toast(r.error, "error");
            router.refresh();
          }
        })
      }
    >
      {pending ? "Einen Moment …" : label}
    </Button>
  );
}

export function AbandonOrderButton({ orderId, redirectTo = "/warenkorb" }: { orderId: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await abandonOrderAction(orderId);
          if (r.ok) {
            toast(r.message ?? "Verworfen.");
            router.push(redirectTo);
          } else toast(r.error, "error");
        })
      }
    >
      Bestellung verwerfen
    </Button>
  );
}

/** Testmodus-Bedienfeld – nur gerendert, wenn der Server den simulierten Anbieter meldet. */
export function SimulationPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (outcome: "success" | "failure") =>
    start(async () => {
      const r = await simulatePaymentAction(orderId, outcome);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      if (outcome === "success") router.push(`/kasse/erfolg?bestellung=${orderId}`);
      else router.push(`/kasse/abgebrochen?bestellung=${orderId}&grund=fehlgeschlagen`);
    });
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button size="lg" disabled={pending} onClick={() => run("success")} className="flex-1">
        Zahlung simulieren – erfolgreich
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => run("failure")} className="flex-1">
        Ablehnung simulieren
      </Button>
    </div>
  );
}

/** Wartet ruhig auf die Bestätigung des Zahlungsanbieters (Webhook) und lädt dann neu. */
export function AwaitConfirmation({ intervalMs = 3000, maxTries = 20 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      router.refresh();
      if (n >= maxTries) clearInterval(t);
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs, maxTries]);
  return null;
}
