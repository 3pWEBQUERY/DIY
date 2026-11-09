"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { replyToReviewAction } from "@/app/(app)/markt/review-actions";
import { callAction } from "@/lib/use-action";

/** Antwort des Shops auf eine Bewertung – nur für die Shop-Inhaberin bzw. den Inhaber sichtbar. */
export function ReviewReply({ reviewId, current, path }: { reviewId: string; current: string | null; path: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-muted hover:text-moss">
        {current ? "Antwort bearbeiten" : "Öffentlich antworten"}
      </button>
    );
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await callAction(() => replyToReviewAction(reviewId, text, path));
          if (!r.ok) return toast(r.error, "error");
          toast(text.trim() ? "Antwort veröffentlicht." : "Antwort entfernt.");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <Textarea aria-label="Antwort auf die Bewertung" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Danke für dein Feedback …" autoFocus />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setText(current ?? ""); setOpen(false); }}>Abbrechen</Button>
        <Button type="submit" size="sm" disabled={pending}>{current && !text.trim() ? "Antwort entfernen" : "Antwort veröffentlichen"}</Button>
      </div>
    </form>
  );
}
