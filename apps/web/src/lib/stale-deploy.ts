"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { confirmDialog } from "@/components/ui/confirm";
import { BRAND } from "@/config/brand";

/**
 * Nach einem Deploy kann eine noch offene Seite auf Code verweisen, den es nicht mehr gibt
 * (Server Action entfernt/umbenannt, alte JS-Chunks). Das ist kein Fehler der Person – die
 * Seite muss nur neu geladen werden. Wir fragen nach, statt eine Fehlerseite zu zeigen.
 */
export function isStaleDeployError(e: unknown) {
  try {
    if (unstable_isUnrecognizedActionError(e)) return true;
  } catch {}
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return name === "UnrecognizedActionError" || name === "ChunkLoadError" || /Server Action "?[\w-]*"? was not found on the server|Failed to find Server Action|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(msg);
}

let asking = false;

export const UPDATE_MESSAGE = {
  title: `${BRAND.name} wurde aktualisiert`,
  body: "Eine neue Version ist online. Lade die Seite neu, damit alles wieder funktioniert. Nicht gespeicherte Eingaben auf dieser Seite gehen dabei verloren – kopiere sie vorher bei Bedarf.",
};

export function promptReload() {
  if (asking) return;
  asking = true;
  void confirmDialog({ ...UPDATE_MESSAGE, confirmLabel: "Neu laden", cancelLabel: "Später", tone: "default" }).then((ok) => {
    asking = false;
    if (ok) location.reload();
  });
}
