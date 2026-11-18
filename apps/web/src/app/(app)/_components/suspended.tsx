import Link from "next/link";
import { Notice } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

/** Konto derzeit gesperrt? (Gleiche Regel wie requireUser: abgelaufene Sperren zählen nicht.) */
export function isSuspended(u: { status: string; suspendedUntil?: Date | null }) {
  return u.status === "SUSPENDED" && (!u.suspendedUntil || u.suspendedUntil > new Date());
}

/** Hinweis für Seiten, die gesperrte Konten lesen, aber nicht ändern dürfen. */
export function SuspendedNotice({ until, className }: { until?: Date | null; className?: string }) {
  return (
    <Notice tone="warn" title="Dein Konto ist derzeit gesperrt" className={className}>
      Du kannst diese Seite ansehen, Änderungen sind aber {until ? `bis ${formatDate(until, { day: "numeric", month: "long", year: "numeric" })}` : "während der Sperre"} nicht möglich. Details findest du in deinen{" "}
      <Link href="/benachrichtigungen" className="font-semibold underline underline-offset-2">Benachrichtigungen</Link>.
    </Notice>
  );
}
