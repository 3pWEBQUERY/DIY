"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { Button, buttonClass } from "@/components/ui/button";

/**
 * Fehleranzeige innerhalb eines Bereichs (App, Studio, Admin): Navigation und Kopfzeile
 * bleiben stehen, nur der Inhalt zeigt den Fehler mit „Erneut versuchen“.
 */
export function SegmentError({
  error,
  retry,
  reset,
  home = "/feed",
}: {
  error: Error & { digest?: string };
  /** Next 16.3+: lädt die Daten neu und rendert erneut (reset() rendert nur neu). */
  retry?: () => void;
  reset?: () => void;
  home?: string;
}) {
  const again = retry ?? reset;
  useEffect(() => {
    console.error(error);
    reportClientError(error, "boundary");
  }, [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="spec">Unerwarteter Fehler{error.digest ? ` · ${error.digest}` : ""}</p>
        <h1 className="display mt-3 text-4xl">Da ist etwas verrutscht.</h1>
        <p className="mt-4 text-muted">Versuch es bitte noch einmal – deine Eingaben sind in der Regel noch da.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Button onClick={() => (again ? again() : location.reload())}>Erneut versuchen</Button>
          <Link href={home} className={buttonClass("outline", "md")}>Zur Übersicht</Link>
        </div>
      </div>
    </div>
  );
}
