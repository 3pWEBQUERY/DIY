"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { confirmReceiptAction, createReviewAction, reportProblemAction } from "@/app/(app)/bestellungen/actions";
import { callAction } from "@/lib/use-action";

export function ReportProblemButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Problem melden
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Problem mit der Bestellung" description="Der Shop wird benachrichtigt und die Bestellung als Problemfall markiert. Am schnellsten löst ihr es gemeinsam per Nachricht.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await callAction(() => reportProblemAction(orderId, note));
              if (r.ok) {
                toast(r.message ?? "Gemeldet.");
                setOpen(false);
                router.refresh();
              } else {
                setError(r.fields?.note ?? r.error);
              }
            });
          }}
        >
          <Field label="Was ist passiert?" error={error} hint="Z. B. „Paket nicht angekommen“, „Artikel beschädigt“, „Falsche Farbe“.">
            {(p) => <Textarea {...p} rows={4} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            Problem melden
          </Button>
        </form>
      </Dialog>
    </>
  );
}

export function ConfirmReceiptButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await callAction(() => confirmReceiptAction(orderId));
          if (r.ok) {
            toast(r.message ?? "Bestätigt.");
            router.refresh();
          } else toast(r.error, "error");
        })
      }
    >
      Erhalt bestätigen
    </Button>
  );
}

function RatingInput({ label, value, onChange, optional }: { label: string; value: number; onChange: (n: number) => void; optional?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">optional</span>}
      </legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} von 5`}
            onClick={() => onChange(value === n && optional ? 0 : n)}
            className="grid size-9 place-items-center hover:bg-sunken rounded-xl"
          >
            <Star size={20} strokeWidth={1.6} className={cn(n <= value ? "fill-clay text-clay" : "text-line-strong")} />
          </button>
        ))}
        <span className="num ml-2 text-[13px] text-muted">{value ? `${value}/5` : "–"}</span>
      </div>
    </fieldset>
  );
}

/** Bewertung je Bestellposition – nur nach Versand/Abschluss, einmalig (§13.9). */
export function ReviewForm({ orderId, orderItemId, title }: { orderId: string; orderItemId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState(0);
  const [seller, setSeller] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Bewerten
      </Button>
    );
  }
  return (
    <form
      className="mt-3 space-y-4 border border-line bg-card p-4 rounded-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (!product) {
          setError("Bitte bewerte den Artikel mit 1 bis 5 Punkten.");
          return;
        }
        start(async () => {
          const r = await callAction(() => createReviewAction(orderId, { orderItemId, productRating: product, sellerRating: seller || undefined, body }));
          if (r.ok) {
            toast(r.message ?? "Danke!");
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <p className="text-[14px] font-semibold">„{title}“ bewerten</p>
      <RatingInput label="Artikel" value={product} onChange={setProduct} />
      <RatingInput label="Shop (Kommunikation, Versand)" value={seller} onChange={setSeller} optional />
      <Field label="Deine Erfahrung" optional hint="Ehrlich und fair – Bewertungen sind öffentlich mit deinem Profilnamen.">
        {(p) => <Textarea {...p} rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Bewertung veröffentlichen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

export function PrintButton({ label = "Drucken" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
