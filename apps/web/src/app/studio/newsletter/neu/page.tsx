import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { cardOptions, countRecipients, newsletterQuota } from "@/server/pro/newsletter";
import { isPro } from "@/server/pro/service";
import { PageHeader } from "@/components/shell/page";
import { NewsletterEditor } from "@/components/pro/newsletter-editor";
import { BRAND } from "@/config/brand";
import { proHref } from "@/lib/pro-features";

export const metadata: Metadata = { title: "Neuer Newsletter" };
export const dynamic = "force-dynamic";

export default async function NewNewsletterPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/newsletter/neu");
  if (!(await isPro(user.id))) redirect(proHref("newsletter"));
  const [options, recipients, quota] = await Promise.all([cardOptions(user), countRecipients(user.id), newsletterQuota(user.id)]);
  return (
    <div>
      <PageHeader kicker={`${BRAND.name} Studio · Newsletter`} title="Neuer Newsletter" />
      <NewsletterEditor
        initial={{ id: null, subject: "", body: "", status: "DRAFT", scheduledAt: null }}
        options={options}
        creator={{ displayName: user.profile.displayName, handle: user.profile.handle }}
        recipients={recipients}
        quotaLeft={quota.left}
        quotaLimit={quota.limit}
      />
    </div>
  );
}
