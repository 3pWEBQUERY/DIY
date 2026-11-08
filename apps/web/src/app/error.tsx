"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "boundary");
  }, [error]);
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
