import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { Onboarding } from "./onboarding";
import { countryPromptFor } from "@/server/account/country";

export const metadata = { title: "Willkommen", robots: { index: false } };

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden");
  const country = user.profile.countryConfirmedAt ? null : await countryPromptFor(user.id);
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { adultConfirmedAt: true, profile: { select: { bio: true, region: true } } } });
  return (
    <Onboarding
      initial={{
        displayName: user.profile.displayName,
        handle: user.profile.handle,
        interests: user.profile.categories,
        bio: full.profile?.bio ?? "",
        region: full.profile?.region ?? "",
        avatarUrl: user.profile.avatarUrl,
      }}
      needsAge={!full.adultConfirmedAt}
      needsCountry={!!country}
      suggestedCountry={country?.suggested ?? null}
    />
  );
}
