/**
 * Stripe-Prüfstatus (gespeichert als „Stripe: <code>“ bzw. „Stripe: 3 Angaben ausstehend“)
 * in verständliche Sätze übersetzen. Codes nach Stripe `requirements.disabled_reason`.
 */
export type StripeNote = { title: string; text: string; tone: "info" | "action" | "problem"; needsAction: boolean };

export function describeStripeNote(notes: string | null | undefined): StripeNote | null {
  if (!notes || !notes.startsWith("Stripe:")) return null;
  const raw = notes.replace(/^Stripe:\s*/, "").trim();
  const due = raw.match(/^(\d+) Angaben ausstehend$/);
  if (due) {
    const n = Number(due[1]);
    return {
      title: "Angaben fehlen noch",
      text: `Stripe braucht noch ${n === 1 ? "eine Angabe" : `${n} Angaben`} von dir, z. B. Ausweis oder Bankverbindung. Ergänze sie über den Knopf unten – danach geht es automatisch weiter.`,
      tone: "action",
      needsAction: true,
    };
  }
  const code = raw.toLowerCase();
  if (code === "under_review" || code === "requirements.pending_verification")
    return {
      title: "Wird geprüft",
      text: "Stripe prüft gerade deine Angaben. Das dauert meist nur wenige Minuten, in Einzelfällen bis zu zwei Werktage. Du musst nichts tun – sobald alles bestätigt ist, wird dein Shop automatisch freigeschaltet.",
      tone: "info",
      needsAction: false,
    };
  if (code === "requirements.past_due" || code === "action_required.requested_capabilities")
    return {
      title: "Angaben fehlen noch",
      text: "Stripe braucht noch Angaben von dir, damit du Zahlungen empfangen kannst. Ergänze sie über den Knopf unten.",
      tone: "action",
      needsAction: true,
    };
  if (code === "platform_paused" || code === "paused.inactivity")
    return { title: "Pausiert", text: "Zahlungen sind für dieses Konto vorübergehend pausiert. Melde dich beim Support, wenn das unerwartet ist.", tone: "problem", needsAction: false };
  if (code.startsWith("rejected"))
    return {
      title: "Von Stripe abgelehnt",
      text: "Stripe kann für dieses Konto keine Zahlungen abwickeln. Melde dich beim Support – wir klären die nächsten Schritte mit dir.",
      tone: "problem",
      needsAction: false,
    };
  if (code === "listed" || code === "other")
    return { title: "Wird geprüft", text: "Stripe prüft dein Konto noch genauer. Falls etwas fehlt, meldet sich Stripe per E-Mail bei dir.", tone: "info", needsAction: false };
  return { title: "Wird geprüft", text: "Stripe prüft deine Angaben – das dauert meist nur wenige Minuten.", tone: "info", needsAction: false };
}
