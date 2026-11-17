import Link from "next/link";
import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { getProfileSettings } from "@/server/account/service";
import { ProfileForm } from "@/components/settings/profile-form";
import { features } from "@/server/env";
import { profileSubdomainUrl } from "@/lib/subdomains";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfileSettingsPage() {
  const user = await requirePageUser("/einstellungen/profil", { allowSuspended: true });
  const p = await getProfileSettings(user.id);
  const ownUrl = profileSubdomainUrl(p.subdomain, features.profileDomain());
  return (
    <div>
      <p className="mb-8 text-sm text-muted">
        So erscheinst du in der Community.{" "}
        <Link href={`/u/${p.handle}`} className="font-semibold text-ink underline underline-offset-2">
          Profil ansehen
        </Link>
      </p>
      {ownUrl && (
        <div className="mb-8 rounded-2xl border border-line bg-card p-4">
          <p className="spec text-muted">Deine eigene Adresse</p>
          <a href={ownUrl} target="_blank" rel="noopener" className="mt-1 block break-all text-[17px] font-semibold text-moss-ink underline-offset-2 hover:underline">
            {ownUrl.replace(/^https:\/\//, "")}
          </a>
          <p className="mt-1 text-[13px] text-muted">Zum Teilen auf Visitenkarten, Instagram oder deiner Website. Sie folgt deinem Benutzernamen – änderst du ihn, ändert sich auch die Adresse.</p>
        </div>
      )}
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
