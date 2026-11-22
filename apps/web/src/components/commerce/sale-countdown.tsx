"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saleCountdownLabel } from "@werkraum/shared";
import { cn } from "@/lib/utils";

/**
 * Ruhiger Countdown einer Shop-Aktion („noch 2 T 4 Std“). Aktualisiert sich jede halbe Minute;
 * ist die Aktion vorbei, lädt die Seite die regulären Preise neu.
 */
export function SaleCountdown({ endsAt, className, prefix = "noch ", refreshOnEnd = true }: { endsAt: string; className?: string; prefix?: string; refreshOnEnd?: boolean }) {
  const router = useRouter();
  const end = new Date(endsAt).getTime();
  // Erste Ausgabe auf Server und Client gleich (Minutengenau gerundet), danach live
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!refreshOnEnd) return;
    const ms = end - Date.now();
    if (ms <= 0 || ms > 2_147_000_000) return;
    const t = setTimeout(() => router.refresh(), ms + 1500);
    return () => clearTimeout(t);
  }, [end, refreshOnEnd, router]);
  const over = now != null && now >= end;
  return (
    <time dateTime={endsAt} className={cn("num font-mono tabular-nums", className)} suppressHydrationWarning>
      {over ? "beendet" : `${prefix}${saleCountdownLabel(endsAt, now != null ? new Date(now) : new Date())}`}
    </time>
  );
}
