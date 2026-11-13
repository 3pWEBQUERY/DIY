"use client";

import { useEffect } from "react";
import { pickWelcomeBackground } from "./welcome-pick";

/** Falls die Startseite per Client-Navigation entsteht, läuft das Inline-Skript nicht – dann hier wählen. */
export function WelcomePickFallback({ id, count }: { id: string; count: number }) {
  useEffect(() => pickWelcomeBackground(document.getElementById(id), count), [id, count]);
  return null;
}
