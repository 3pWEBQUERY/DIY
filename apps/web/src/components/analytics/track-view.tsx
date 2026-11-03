"use client";

import { useEffect } from "react";

type Trackable = "POST" | "PROJECT" | "TUTORIAL" | "ARTICLE" | "PRODUCT" | "USER" | "COMMUNITY";

/**
 * Unsichtbarer Aufrufzähler für Detailseiten. Einbinden mit
 * `<TrackView targetType="PROJECT" targetId={project.id} />`.
 * Zählt erst, wenn die Seite sichtbar ist; nutzt `sendBeacon`, wo möglich.
 * Für Profilaufrufe: `targetType="USER"` mit der User-ID.
 */
export function TrackView({ targetType, targetId, source }: { targetType: Trackable; targetId: string; source?: string }) {
  useEffect(() => {
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      const payload = JSON.stringify({ name: "view", targetType, targetId, ref: source });
      try {
        if (navigator.sendBeacon?.("/api/v1/track", new Blob([payload], { type: "application/json" }))) return;
      } catch {
        /* Fallback unten */
      }
      fetch("/api/v1/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    };
    const t = window.setTimeout(send, 1200);
    const onVis = () => document.visibilityState === "visible" && window.setTimeout(send, 1200);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [targetType, targetId, source]);
  return null;
}
