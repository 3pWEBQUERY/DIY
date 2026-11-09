"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import type { ActionResult } from "@/server/errors";
import { toast } from "@/components/ui/toast";
import { isStaleDeployError, promptReload } from "./stale-deploy";
import { reportClientError } from "./report-error";

export const OFFLINE_MESSAGE = "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut – deine Eingaben bleiben erhalten.";

/**
 * Server Action aufrufen, ohne dass Netz- oder Serverfehler (offline, 502, Zeitüberschreitung) die ganze
 * Seite in die Fehlerseite reissen – Eingaben gingen sonst verloren. Navigation (redirect/notFound) wird
 * weitergereicht; nach einem Deploy wird zum Neuladen aufgefordert.
 */
export async function callAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (isStaleDeployError(e)) {
      promptReload();
      return { ok: false, code: "UNAVAILABLE", error: "Werkuno wurde aktualisiert – bitte lade die Seite neu." };
    }
    reportClientError(e);
    return { ok: false, code: "UNAVAILABLE", error: OFFLINE_MESSAGE };
  }
}

/**
 * Client-Helfer für Server Actions mit einheitlicher Fehlerstruktur.
 * Liefert Feldfehler, Pending-Status und optionalen Refresh/Redirect.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  opts: { success?: string | ((d: T) => string | undefined); refresh?: boolean; redirect?: string | ((d: T) => string | undefined); onSuccess?: (d: T) => void } = {},
) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function run(...args: A) {
    return new Promise<ActionResult<T>>((resolve) => {
      start(async () => {
        setError(null);
        // Netzfehler/Deploy → Fehlermeldung statt Fehlerseite (Eingaben bleiben stehen)
        const res = await callAction(() => action(...args));
        if (res.ok) {
          setFields({});
          const msg = typeof opts.success === "function" ? opts.success(res.data) : (opts.success ?? res.message);
          if (msg) toast(msg);
          opts.onSuccess?.(res.data);
          const to = typeof opts.redirect === "function" ? opts.redirect(res.data) : opts.redirect;
          if (to) router.push(to);
          else if (opts.refresh !== false) router.refresh();
        } else {
          setFields(res.fields ?? {});
          setError(res.error);
          if (res.code === "UNAUTHENTICATED") router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
          else if (!res.fields || Object.keys(res.fields).length === 0) toast(res.error, "error");
        }
        resolve(res);
      });
    });
  }

  return { run, pending, fields, error, setError };
}

/** FormData → Objekt (inkl. Checkboxen & Mehrfachwerte mit `name[]`). */
export function formToObject(form: HTMLFormElement | FormData) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] as unknown[] | undefined) ? (out[key] as unknown[]).push(v) : (out[key] = [v]);
    } else if (v === "on") out[k] = true;
    else out[k] = v;
  }
  return out;
}
