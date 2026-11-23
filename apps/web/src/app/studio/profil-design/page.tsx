import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { profileThemeSettings } from "@/server/pro/profile-theme";
import { db } from "@/server/db";
import { PageHeader } from "@/components/shell/page";
import { Notice } from "@/components/ui/misc";
import { ProfileThemeEditor } from "@/components/pro/profile-theme-editor";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Profil-Design" };

/** Studio: Akzentfarbe, Titelbild und Reihenfolge der Profilbereiche (Creator Pro). */
export default async function ProfileDesignPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/profil-design");
  const [s, cover] = await Promise.all([profileThemeSettings(user.id), db.userProfile.findUnique({ where: { userId: user.id }, select: { coverUrl: true } })]);

  return (
    <div>
      <PageHeader
        kicker={`${BRAND.name} Studio · Creator Pro`}
        title="Profil-Design"
        description="Gib deinem Profil deine Handschrift: Akzentfarbe, Titelbild und die Reihenfolge deiner Bereiche. Gilt im Web und in der iOS-App."
      />
      {!s.pro && (
        <Notice tone="neutral" className="mb-8" title="Gehört zu Creator Pro">
          Du kannst alles ausprobieren – speichern und auf deinem Profil zeigen geht mit Creator Pro.{" "}
          <Link href="/studio/pro" className="font-semibold underline">
            Creator Pro ansehen
          </Link>
        </Notice>
      )}
      <ProfileThemeEditor
        initial={s.theme}
        custom={s.custom}
        pro={s.pro}
        profile={{ handle: user.profile.handle, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl, coverUrl: cover?.coverUrl ?? null }}
      />
    </div>
  );
}
