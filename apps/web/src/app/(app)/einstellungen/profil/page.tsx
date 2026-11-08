import Link from "next/link";
import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { getProfileSettings } from "@/server/account/service";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfileSettingsPage() {
  const user = await requirePageUser("/einstellungen/profil", { allowSuspended: true });
  const p = await getProfileSettings(user.id);
  return (
    <div>
      <p className="mb-8 text-sm text-muted">
        So erscheinst du in der Community.{" "}
        <Link href={`/u/${p.handle}`} className="font-semibold text-ink underline underline-offset-2">
          Profil ansehen
        </Link>
      </p>
      <ProfileForm
        profile={{
          displayName: p.displayName,
          handle: p.handle,
          bio: p.bio,
          region: p.region,
          country: p.country,
          website: p.website,
          pronouns: p.pronouns,
          links: p.links,
          categories: p.categories,
          avatarUrl: p.avatarUrl,
          coverUrl: p.coverUrl,
        }}
      />
    </div>
  );
}
