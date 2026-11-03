import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getPrivacySettings } from "@/server/account/service";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { SettingsSection } from "@/components/settings/section";
import { UnblockButton } from "@/components/settings/relation-buttons";
import { Avatar } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Privatsphäre" };

export default async function PrivacySettingsPage() {
  const user = await requireUser();
  const s = await getPrivacySettings(user.id);
  return (
    <div>
      <PrivacyForm dmPolicy={s.dmPolicy} reduceMotion={s.reduceMotion} />
      <SettingsSection n="03" title="Blockierte Profile" description="Blockieren wirkt in beide Richtungen: Ihr seht keine Inhalte voneinander, könnt euch nicht folgen und nicht schreiben. Die Person wird nicht benachrichtigt.">
        {s.blocked.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {s.blocked.map((b) => (
              <li key={b.blocked.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={b.blocked.profile?.avatarUrl} name={b.blocked.profile?.displayName ?? "?"} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{b.blocked.profile?.displayName ?? "Unbekannt"}</span>
                  <span className="block text-xs text-muted">@{b.blocked.profile?.handle} · blockiert seit {formatDate(b.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <UnblockButton userId={b.blocked.id} name={b.blocked.profile?.displayName ?? "dieser Person"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Du hast niemanden blockiert.</p>
        )}
        <p className="mt-4 text-xs text-muted">
          Mehr dazu, wie wir deine Daten schützen: <Link href="/rechtliches/datenschutz" className="underline">Datenschutzerklärung</Link>
        </p>
      </SettingsSection>
    </div>
  );
}
