"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/** Globale Browser-Fehler (auch ausserhalb von React) an die Fehlerüberwachung melden. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      // Fehler aus fremden Skripten/Erweiterungen haben keinen Stack von unserer Seite
      if (!ev.error && !ev.filename?.startsWith(location.origin)) return;
      reportClientError(ev.error ?? ev.message, "error");
    };
    const onRejection = (ev: PromiseRejectionEvent) => reportClientError(ev.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
