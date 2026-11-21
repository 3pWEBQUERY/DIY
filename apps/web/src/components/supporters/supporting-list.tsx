"use client";

import Link from "next/link";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Empty } from "@/components/ui/misc";
import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";
import { setSupportCancelAction } from "@/app/(app)/supporter-actions";

type Row = { creatorId: string; handle: string; displayName: string; avatarUrl: string | null; provider: string; priceMinor: number; currency?: string; active: boolean; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null; since: string };
const day = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

/** Eigene Unterstützungen: Stand, Kündigen bzw. Kündigung zurücknehmen (Web), Hinweis bei App-Käufen. */
export function SupportingList({ rows }: { rows: Row[] }) {
  const cancel = useAction(setSupportCancelAction);
  if (!rows.length) return <Empty title="Du unterstützt noch niemanden" body="Auf Profilen von Creator:innen findest du den Knopf „Unterstützen“, wenn sie ein Unterstützer-Abo anbieten." />;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <li key={r.creatorId} className="flex flex-wrap items-center gap-3 py-4">
          <Avatar src={r.avatarUrl} name={r.displayName} size={40} />
          <div className="min-w-0 flex-1">
            <Link href={`/u/${r.handle}`} className="block truncate text-[15px] font-semibold hover:underline">
              {r.displayName}
            </Link>
            <p className="text-[13px] text-muted">
              {formatMoney(r.priceMinor, r.currency)}/Monat · {r.provider === "apple" ? "über die iOS-App" : r.provider === "stripe" ? "über die Website" : "Testmodus"}
              {r.active && r.currentPeriodEnd
                ? r.provider === "apple" || r.cancelAtPeriodEnd
                  ? ` · endet am ${day(r.currentPeriodEnd)}`
                  : ` · nächste Zahlung am ${day(r.currentPeriodEnd)}`
                : ""}
            </p>
          </div>
          <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? (r.cancelAtPeriodEnd && r.provider !== "apple" ? "Gekündigt" : "Aktiv") : "Beendet"}</Badge>
          {r.active && r.provider !== "apple" && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.pending}
              onClick={async () => {
                if (r.cancelAtPeriodEnd) return void cancel.run(r.creatorId, false);
                if (await confirmDialog({ title: `Unterstützung für ${r.displayName} kündigen?`, body: "Sie läuft bis zum Ende des bezahlten Monats weiter, danach wird nichts mehr abgebucht.", confirmLabel: "Kündigen", tone: "danger" })) cancel.run(r.creatorId, true);
              }}
            >
              {r.cancelAtPeriodEnd ? "Fortsetzen" : "Kündigen"}
            </Button>
          )}
          {r.active && r.provider === "apple" && <p className="w-full pl-[52px] text-[12.5px] text-muted">In der App gekauft: verlängert sich nicht automatisch. Verlängern kannst du in der iOS-App auf dem Profil.</p>}
        </li>
      ))}
    </ul>
  );
}
