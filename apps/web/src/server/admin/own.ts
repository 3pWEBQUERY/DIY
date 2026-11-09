import "server-only";
import { fail } from "@/server/errors";

/**
 * Vier-Augen-Prinzip: Eigene Inhalte, den eigenen Shop, eigene Produkte und Bewertungen dazu
 * prüft immer eine andere Person aus dem Team (keine Selbstbegünstigung, keine Selbstentlastung).
 */
export function assertNotOwn(actor: { id: string }, ...ownerIds: (string | null | undefined)[]) {
  if (ownerIds.includes(actor.id)) {
    throw fail.forbidden("Eigene Inhalte, deinen Shop und Bewertungen dazu prüft eine andere Person aus dem Team.");
  }
}
