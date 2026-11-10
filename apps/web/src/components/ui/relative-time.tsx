"use client";

import { useEffect, useState } from "react";
import { formatDate, relativeTime } from "@/lib/utils";

/**
 * Relative Zeitangabe („vor 5 Minuten“) ohne Hydration-Warnung: Server und Browser rechnen mit
 * verschiedenen „Jetzt“-Zeitpunkten. Der erste Render übernimmt deshalb den Server-Text
 * (suppressHydrationWarning), nach dem Einhängen rechnet der Browser neu und aktualisiert minütlich.
 */
export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time
      dateTime={iso}
      title={formatDate(iso, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      className={className}
      suppressHydrationWarning
    >
      {relativeTime(iso)}
    </time>
  );
}
