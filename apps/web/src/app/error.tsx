"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { Button } from "@/components/ui/button";
import { isStaleDeployError, UPDATE_MESSAGE } from "@/lib/stale-deploy";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployError(error);
  useEffect(() => {
    if (stale) return;
    console.error(error);
    reportClientError(error, "boundary");
  }, [error, stale]);
  if (stale)
    return (
      <main id="main" className="grid min-h-[70dvh] place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="spec">Neue Version</p>
          <h1 className="display mt-3 text-4xl">{UPDATE_MESSAGE.title}</h1>
          <p className="mt-4 text-muted">Lade die Seite neu, um weiterzumachen.</p>
          <Button className="mt-8" onClick={() => location.reload()}>
            Seite neu laden
          </Button>
        </div>
      </main>
    );
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="spec">Unerwarteter Fehler{error.digest ? ` · ${error.digest}` : ""}</p>
        <h1 className="display mt-3 text-4xl">Da ist etwas verrutscht.</h1>
        <p className="mt-4 text-muted">Wir wurden informiert. Versuch es bitte noch einmal – deine Eingaben sind in der Regel noch da.</p>
        <Button className="mt-8" onClick={reset}>
          Erneut versuchen
        </Button>
      </div>
    </main>
  );
}
