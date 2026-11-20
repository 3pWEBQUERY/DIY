import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { listMySupporting } from "@/server/supporters/service";
import { SettingsSection } from "@/components/settings/section";
import { SupportingList } from "@/components/supporters/supporting-list";

export const metadata: Metadata = { title: "Unterstützungen" };

export default async function SupportingSettingsPage() {
  const user = await requirePageUser("/einstellungen/unterstuetzungen");
  const rows = await listMySupporting(user.id);
  return (
    <SettingsSection n="01" title="Meine Unterstützungen" description="Personen, die du mit dem Unterstützer-Abo unterstützt. Über die Website abgeschlossene Abos verlängern sich monatlich und lassen sich hier kündigen.">
      <SupportingList rows={rows} />
    </SettingsSection>
  );
}
