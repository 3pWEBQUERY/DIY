import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getFeedSettings } from "@/server/account/service";
import { FeedForm } from "@/components/settings/feed-form";
import { SettingsSection } from "@/components/settings/section";
import { ResetHiddenButton, UnmuteButton } from "@/components/settings/relation-buttons";
import { Avatar } from "@/components/ui/misc";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Feed & Interessen" };

export default async function FeedSettingsPage() {
  const user = await requireUser();
  const s = await getFeedSettings(user.id);
  return (
    <div>
      <FeedForm interests={s.interests} hidden={s.hiddenCategories} feedDefault={s.feedDefault} />

      <SettingsSection n="03" title="Stummgeschaltete Profile" description="Ihre Beiträge erscheinen nicht in deinen Feeds. Profile bleiben direkt erreichbar, und sie erfahren nichts davon.">
        {s.muted.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {s.muted.map((m) => (
              <li key={m.muted.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={m.muted.profile?.avatarUrl} name={m.muted.profile?.displayName ?? "?"} size={32} />
                <Link href={`/u/${m.muted.profile?.handle}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm font-semibold">{m.muted.profile?.displayName}</span>
                  <span className="block text-xs text-muted">@{m.muted.profile?.handle}</span>
                </Link>
                <UnmuteButton userId={m.muted.id} name={m.muted.profile?.displayName ?? ""} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Du hast niemanden stummgeschaltet.</p>
        )}
      </SettingsSection>

      <SettingsSection n="04" title="Ausgeblendete Inhalte" description="Inhalte, die du mit „Weniger davon“ ausgeblendet hast.">
        <div className="flex items-center justify-between gap-4 border border-line bg-card px-4 py-3">
          <span className="text-sm">{s.hiddenCount ? pluralize(s.hiddenCount, "Inhalt ausgeblendet", "Inhalte ausgeblendet") : "Keine ausgeblendeten Inhalte"}</span>
          <ResetHiddenButton count={s.hiddenCount} />
        </div>
      </SettingsSection>
    </div>
  );
}
