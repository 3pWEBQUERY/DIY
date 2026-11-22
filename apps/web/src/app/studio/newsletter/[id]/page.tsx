import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { cardOptions, countRecipients, getMyNewsletter, newsletterQuota } from "@/server/pro/newsletter";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/shell/page";
import { NewsletterEditor } from "@/components/pro/newsletter-editor";
import { rate } from "@/lib/newsletter";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? "–" : `${n} %`);

export default async function NewsletterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  if (!user?.profile) redirect(`/anmelden?weiter=/studio/newsletter/${id}`);
  const n = await getMyNewsletter(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!n) notFound();
  const [options, recipients, quota] = await Promise.all([cardOptions(user), countRecipients(user.id), newsletterQuota(user.id)]);
  const sent = n.status === "SENT" || n.status === "SENDING";
  return (
    <div>
      <PageHeader kicker={`${BRAND.name} Studio · Newsletter`} title={n.subject} />
      {sent && (
        <dl className="mb-10 grid grid-cols-3 border-y border-rule py-4">
          <div>
            <dt className="spec">Empfänger:innen</dt>
            <dd className="num mt-1 font-mono text-xl">{n.recipientCount.toLocaleString("de-CH")}</dd>
          </div>
          <div>
            <dt className="spec">Geöffnet</dt>
            <dd className="num mt-1 font-mono text-xl">
              {pct(rate(n.openCount, n.recipientCount))} <span className="text-[13px] text-muted">({n.openCount})</span>
            </dd>
          </div>
          <div>
            <dt className="spec">Geklickt</dt>
            <dd className="num mt-1 font-mono text-xl">
              {pct(rate(n.clickCount, n.recipientCount))} <span className="text-[13px] text-muted">({n.clickCount})</span>
            </dd>
          </div>
        </dl>
      )}
      <NewsletterEditor
        initial={{ id: n.id, subject: n.subject, body: n.body, status: n.status, scheduledAt: n.scheduledAt }}
        options={options}
        creator={{ displayName: user.profile.displayName, handle: user.profile.handle }}
        recipients={recipients}
        quotaLeft={quota.left}
        quotaLimit={quota.limit}
      />
    </div>
  );
}
