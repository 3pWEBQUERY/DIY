import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { getNotificationSettings } from "@/server/account/service";
import { NotificationMatrix } from "@/components/settings/notification-matrix";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function NotificationSettingsPage() {
  const user = await requirePageUser("/einstellungen/benachrichtigungen", { allowSuspended: true });
  const s = await getNotificationSettings(user.id);
  return <NotificationMatrix rows={s.matrix} digest={s.emailDigest} />;
}
