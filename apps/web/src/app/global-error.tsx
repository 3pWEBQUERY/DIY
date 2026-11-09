"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { isStaleDeployError } from "@/lib/stale-deploy";

/** Letzte Rückfallebene, falls selbst das Root-Layout scheitert (eigenes <html>, keine App-Styles). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployError(error);
  useEffect(() => {
    if (!stale) reportClientError(error, "boundary");
  }, [error, stale]);
  return (
    <html lang="de-CH">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#FAF8F5", color: "#262427", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>{stale ? "Werkuno wurde aktualisiert" : "Da ist etwas verrutscht."}</h1>
          <p style={{ color: "#6B6461", margin: "0 0 24px" }}>Bitte lade die Seite neu.</p>
          <button onClick={() => (stale ? location.reload() : reset())} style={{ background: "#B64B3A", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}>
            {stale ? "Seite neu laden" : "Erneut versuchen"}
          </button>
        </div>
      </body>
    </html>
  );
}
