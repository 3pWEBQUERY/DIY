"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, VolumeX, Volume2, Ban } from "lucide-react";
import { MoreMenu, ReportDialog } from "@/components/social/actions";
import { toast } from "@/components/ui/toast";
import { blockAction, muteAction } from "@/app/(app)/social-actions";

export function ProfileSafetyMenu({ userId, name, muted }: { userId: string; name: string; blocked: boolean; muted: boolean }) {
  const router = useRouter();
  const [report, setReport] = useState(false);
  const run = async (p: Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    const r = await p;
    if (r.ok) {
      if (r.message) toast(r.message);
      router.refresh();
    } else toast(r.error, "error");
  };
  return (
    <>
      <MoreMenu
        label="Profilaktionen"
        items={[
          { label: "Profil melden", icon: <Flag size={15} />, onSelect: () => setReport(true) },
          muted
            ? { label: "Stummschaltung aufheben", icon: <Volume2 size={15} />, onSelect: () => run(muteAction(userId, false)) }
            : { label: "Stummschalten", icon: <VolumeX size={15} />, onSelect: () => run(muteAction(userId, true)) },
          { label: `${name} blockieren`, icon: <Ban size={15} />, danger: true, onSelect: () => confirm(`${name} blockieren? Ihr könnt euch dann gegenseitig nicht mehr sehen oder kontaktieren.`) && run(blockAction(userId, true)) },
        ]}
      />
      <ReportDialog open={report} onClose={() => setReport(false)} targetType="USER" targetId={userId} />
    </>
  );
}
