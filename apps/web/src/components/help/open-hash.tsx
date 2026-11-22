"use client";

import { useEffect } from "react";

/** Frage aus dem Anker (#rueckgabe) aufklappen und in den Blick holen – auch bei Klicks innerhalb der Seite */
export function OpenHashDetails() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
        el.querySelector("summary")?.focus({ preventScroll: true });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
