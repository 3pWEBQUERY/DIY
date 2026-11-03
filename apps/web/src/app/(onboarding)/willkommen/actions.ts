"use server";

import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { completeOnboarding, skipOnboarding } from "@/server/identity/onboarding";
import { suggestedCreators, suggestedCommunities } from "@/server/discovery/suggestions";
import { db } from "@/server/db";

export async function finishOnboardingAction(input: unknown) {
  return act(async () => {
    await completeOnboarding(await requireUser(), input);
    return null;
  });
}

export async function skipOnboardingAction() {
  return act(async () => {
    await skipOnboarding(await requireUser());
    return null;
  });
}

export async function suggestionsAction(interests: string[]) {
  const u = await requireUser();
  const [creators, communities] = await Promise.all([suggestedCreators(u.id, interests, 6), suggestedCommunities(u.id, interests, 4)]);
  return { creators, communities };
}

export async function joinCommunityQuickAction(communityId: string) {
  return act(async () => {
    const u = await requireUser();
    const c = await db.community.findUnique({ where: { id: communityId }, select: { visibility: true } });
    if (!c || c.visibility !== "PUBLIC") return { joined: false };
    const existing = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: u.id } } });
    if (!existing) {
      await db.$transaction([
        db.communityMember.create({ data: { communityId, userId: u.id } }),
        db.community.update({ where: { id: communityId }, data: { memberCount: { increment: 1 } } }),
      ]);
    }
    return { joined: true };
  });
}

