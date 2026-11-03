import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getNotificationSettings } from "@/server/account/service";
import { NotificationMatrix } from "@/components/settings/notification-matrix";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function NotificationSettingsPage() {
  const user = await requireUser({ allowSuspended: true });
  const s = await getNotificationSettings(user.id);
  return <NotificationMatrix rows={s.matrix} digest={s.emailDigest} />;
}
