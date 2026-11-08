"use client";

import { useState } from "react";
import { Check, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cancelEventAction, setAttendanceAction } from "@/app/(app)/communities/event-actions";

/** Zusage / Interesse / Absage für ein Event. */
export function RsvpButtons({ eventId, status, full, isOrganizer }: { eventId: string; status: "GOING" | "INTERESTED" | null; full: boolean; isOrganizer: boolean }) {
  const { run, pending } = useAction(setAttendanceAction);
  if (isOrganizer) return <p className="text-sm text-muted">Du organisierst dieses Event.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "GOING" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(eventId, null)}>
          <X size={15} aria-hidden /> Doch nicht dabei
        </Button>
      ) : (
        <Button disabled={pending || full} onClick={() => run(eventId, "GOING")} title={full ? "Ausgebucht" : undefined}>
          <Check size={15} aria-hidden /> {full ? "Ausgebucht" : "Ich bin dabei"}
        </Button>
      )}
      {status !== "GOING" &&
        (status === "INTERESTED" ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(eventId, null)}>
            Nicht mehr interessiert
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => run(eventId, "INTERESTED")}>
            <Star size={15} aria-hidden /> Interessiert
          </Button>
        ))}
    </div>
  );
}

/** Absage durch Veranstalter:in oder Moderation – mit optionalem Grund für die Teilnehmenden. */
export function CancelEventButton({ eventId, slug }: { eventId: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction(cancelEventAction, { redirect: () => `/c/${slug}/events/${eventId}`, onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-danger">
        Event absagen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Event absagen?" description="Alle Teilnehmenden werden benachrichtigt. Das lässt sich nicht rückgängig machen.">
        <label htmlFor="cancel-reason" className="mb-1.5 block text-[13px] font-semibold">
          Grund <span className="font-normal text-muted">optional</span>
        </label>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="z. B. Krankheit – wir holen es nach." />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Zurück
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => run(eventId, slug, reason)}>
            Endgültig absagen
          </Button>
        </div>
      </Dialog>
    </>
  );
}
