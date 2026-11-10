"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cancelRestockAction, requestRestockAction } from "@/app/(app)/markt/actions";

/**
 * Ausverkauftes Produkt: „Wird das nachproduziert?“ beim Shop anfragen. Der Shop erhält eine Benachrichtigung;
 * sobald wieder Bestand da ist, meldet Werkuno sich automatisch bei allen, die angefragt haben.
 */
export function RestockRequest({
  productId,
  shopName,
  signedIn,
  requested: initialRequested,
}: {
  productId: string;
  shopName: string;
  signedIn: boolean;
  requested: boolean;
}) {
  const router = useRouter();
  const [requested, setRequested] = useState(initialRequested);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const r = await requestRestockAction(productId, note, location.pathname);
      if (r.ok) {
        setRequested(true);
        setOpen(false);
        setNote("");
        toast(`Anfrage an ${shopName} gesendet. Wir melden uns, sobald es wieder verfügbar ist.`);
        router.refresh();
      } else if (r.code === "UNAUTHENTICATED") router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
      else toast(r.error, "error");
    });
  }

  function cancel() {
    start(async () => {
      const r = await cancelRestockAction(productId, location.pathname);
      if (r.ok) {
        setRequested(false);
        toast("Anfrage zurückgezogen.");
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  if (requested) {
    return (
      <div className="space-y-2 rounded-2xl border border-moss/30 bg-moss-soft p-4 text-[14px]">
        <p className="flex items-center gap-2 font-semibold text-moss-ink">
          <Check size={16} aria-hidden /> Nachproduktion angefragt
        </p>
        <p className="text-ink-2">Sobald das Produkt wieder verfügbar ist, bekommst du eine Benachrichtigung.</p>
        <button type="button" className="text-[13px] font-semibold text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50" onClick={cancel} disabled={pending}>
          Anfrage zurückziehen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line-strong bg-card p-4">
      <div>
        <p className="font-semibold text-ink">Wird das nachproduziert?</p>
        <p className="mt-1 text-[13.5px] text-muted">Frag {shopName} an. Du wirst benachrichtigt, sobald es wieder verfügbar ist.</p>
      </div>
      {!signedIn ? (
        <Link href="/anmelden" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-moss bg-moss px-5 text-sm font-semibold text-paper hover:bg-moss-ink">
          <BellRing size={16} aria-hidden /> Anmelden und anfragen
        </Link>
      ) : open ? (
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Optional: Wunschfarbe, Grösse, Menge …"
            aria-label="Notiz an den Shop (optional)"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={send} disabled={pending}>
              Anfrage senden
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setOpen(true)}>
          <BellRing size={16} aria-hidden /> Nachproduktion anfragen
        </Button>
      )}
    </div>
  );
}
