import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/notifications";

export const GET = api(async () => {
  const u = await requireUser();
  return {
    id: u.id,
    role: u.role,
    emailVerified: !!u.emailVerifiedAt,
    onboarded: !!u.onboardedAt,
    profile: u.profile,
    shop: u.shop,
    unreadNotifications: await unreadCount(u.id),
  };
});
