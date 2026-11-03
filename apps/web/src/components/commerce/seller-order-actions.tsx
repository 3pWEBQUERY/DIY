"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUS_LABEL, ORDER_TRANSITIONS, formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { parseMoneyInput, minorToInput } from "@/server/commerce/rules";
import { addShipmentAction, cancelOrderAction, refundOrderAction, transitionOrderAction } from "@/app/studio/bestellungen/actions";

const CARRIERS = ["Die Post", "DHL", "DPD", "Planzer", "UPS", "GLS", "Persönliche Übergabe", "Andere"];

/** Nächste sinnvolle Schritte – nur Übergänge, die die Statusmaschine erlaubt. */
const PRIMARY_LABEL: Partial<Record<OrderStatus, string>> = {
  IN_PROGRESS: "In Bearbeitung nehmen",
  READY_TO_SHIP: "Als versandbereit markieren",
  COMPLETED: "Als abgeschlossen markieren",
  PROBLEM: "Als Problemfall markieren",
};

export function SellerOrderActions({
  orderId,
  status,
  currency,
  refundableMinor,
  canRefund,
  canCancel,
  digitalOnly,
}: {
  orderId: string;
  status: OrderStatus;
  currency: Currency;
  refundableMinor: number;
  canRefund: boolean;
  canCancel: boolean;
  digitalOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "ship" | "refund" | "cancel" | { to: OrderStatus }>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [ship, setShip] = useState({ carrier: CARRIERS[0]!, trackingNo: "", trackingUrl: "", note: "" });
  const [refund, setRefund] = useState({ amount: minorToInput(refundableMinor), reason: "" });

  const meta =
    dialog === "ship"
      ? { title: "Versand erfassen", description: "Die Bestellung wird als „Versendet“ markiert und die Sendungsnummer geteilt." }
      : dialog === "refund"
        ? { title: "Erstattung", description: `Erstattbar: ${formatMoney(refundableMinor, currency)}. Die Plattformgebühr wird anteilig zurückerstattet.` }
        : dialog === "cancel"
          ? { title: "Bestellung stornieren", description: "Der Bestand wird zurückgebucht und der bezahlte Betrag vollständig erstattet." }
          : dialog
            ? { title: `Status: ${ORDER_STATUS_LABEL[dialog.to]}`, description: "Die Käuferin bzw. der Käufer wird benachrichtigt." }
            : { title: "", description: undefined };

  const next = ORDER_TRANSITIONS[status].filter((s) => s !== "CANCELLED" && s !== "SHIPPED");
  const canShip = ORDER_TRANSITIONS[status].includes("SHIPPED") && !digitalOnly;

  const close = () => {
    setDialog(null);
    setFields({});
    setNote("");
  };
  const done = (r: { ok: boolean; error?: string; message?: string; fields?: Record<string, string> }) => {
    if (r.ok) {
      toast(r.message ?? "Gespeichert.");
      close();
      router.refresh();
    } else {
      setFields(r.fields ?? {});
      if (!r.fields || !Object.keys(r.fields).length) toast(r.error ?? "Fehler", "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canShip && <Button onClick={() => setDialog("ship")}>Versand erfassen</Button>}
        {next.map((to) => (
          <Button key={to} variant={to === "PROBLEM" ? "ghost" : canShip ? "outline" : "primary"} onClick={() => setDialog({ to })}>
            {PRIMARY_LABEL[to] ?? ORDER_STATUS_LABEL[to]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {canRefund && refundableMinor > 0 && (
          <Button variant="outline" size="sm" onClick={() => setDialog("refund")}>
            Erstatten
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDialog("cancel")}>
            Stornieren & erstatten
          </Button>
        )}
      </div>

      <Dialog open={!!dialog} onClose={close} title={meta.title} description={meta.description}>
        {typeof dialog === "object" && dialog && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => done(await transitionOrderAction(orderId, dialog.to, note)));
            }}
          >
            <Field label="Notiz an die Käuferin / den Käufer" optional hint={dialog.to === "PROBLEM" ? "Beschreibe kurz, was nicht stimmt." : undefined}>
              {(p) => <Textarea {...p} rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>
              Bestätigen
            </Button>
          </form>
        )}

        {dialog === "ship" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => done(await addShipmentAction(orderId, ship)));
            }}
          >
            <Field label="Versanddienstleister" error={fields.carrier}>
              {(p) => (
                <Select {...p} value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })}>
                  {CARRIERS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Sendungsnummer" optional error={fields.trackingNo}>
              {(p) => <Input {...p} value={ship.trackingNo} maxLength={80} className="font-mono" onChange={(e) => setShip({ ...ship, trackingNo: e.target.value })} />}
            </Field>
            <Field label="Link zur Sendungsverfolgung" optional error={fields.trackingUrl}>
              {(p) => <Input {...p} type="url" placeholder="https://" value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} />}
            </Field>
            <Field label="Notiz" optional>
              {(p) => <Input {...p} value={ship.note} maxLength={500} onChange={(e) => setShip({ ...ship, note: e.target.value })} />}
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>
              Als versendet markieren
            </Button>
          </form>
        )}

        {dialog === "refund" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const amountMinor = parseMoneyInput(refund.amount);
              if (!amountMinor) {
                setFields({ amountMinor: "Bitte einen gültigen Betrag angeben" });
                return;
              }
              if (!confirm(`${formatMoney(amountMinor, currency)} erstatten? Das kann nicht rückgängig gemacht werden.`)) return;
              start(async () => done(await refundOrderAction(orderId, { amountMinor, reason: refund.reason })));
            }}
          >
            <Field label={`Betrag in ${currency}`} error={fields.amountMinor} hint="Für eine Teilerstattung den Betrag anpassen.">
              {(p) => <Input {...p} inputMode="decimal" className="num" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />}
            </Field>
            <Field label="Grund" error={fields.reason} hint="Wird protokolliert und hilft bei Rückfragen.">
              {(p) => <Textarea {...p} rows={3} value={refund.reason} maxLength={500} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />}
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>
              Erstattung auslösen
            </Button>
          </form>
        )}

        {dialog === "cancel" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => done(await cancelOrderAction(orderId, note)));
            }}
          >
            <Field label="Grund (wird der Käuferin bzw. dem Käufer mitgeteilt)" error={fields.reason}>
              {(p) => <Textarea {...p} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} required />}
            </Field>
            <Button type="submit" variant="danger" className="w-full" disabled={pending || note.trim().length < 3}>
              Stornieren und {formatMoney(refundableMinor, currency)} erstatten
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
