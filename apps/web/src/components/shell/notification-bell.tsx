"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { badgeText, useLiveCounts } from "./live-counts";

/** Glocke in der mobilen Kopfzeile mit Live-Zähler. */
export function NotificationBell() {
  const { notifications } = useLiveCounts();
  return (
    <Link href="/benachrichtigungen" className="relative grid size-10 place-items-center" aria-label={`Benachrichtigungen${notifications ? `, ${notifications} ungelesen` : ""}`}>
      <Bell size={20} strokeWidth={1.6} />
      {notifications > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-clay px-1 text-[10px] font-bold text-paper ring-2 ring-paper">{badgeText(notifications, 9)}</span>
      )}
    </Link>
  );
}
