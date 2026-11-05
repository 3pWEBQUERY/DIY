"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LIVE_EVENT, type LiveDetail } from "@/components/shell/live-counts";

/** Posteingang live halten: bei neuen Nachrichten oder Lesebestätigungen die Liste neu laden. */
export function InboxLive() {
  const router = useRouter();
  useEffect(() => {
    let t: number | undefined;
    const on = (e: Event) => {
      const d = (e as CustomEvent<LiveDetail>).detail;
      if (d?.type !== "message" && d?.type !== "read") return;
      window.clearTimeout(t);
      t = window.setTimeout(() => router.refresh(), 300);
    };
    window.addEventListener(LIVE_EVENT, on);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(LIVE_EVENT, on);
    };
  }, [router]);
  return null;
}
