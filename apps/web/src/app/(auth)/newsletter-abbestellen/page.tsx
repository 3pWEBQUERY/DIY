import { LinkButton } from "@/components/ui/button";
import { unsubscribeContext } from "@/server/pro/newsletter";
import { flatSearchParams } from "@/lib/search-params";
import { NewsletterUnsubscribeButton } from "./button";

export const metadata = { title: "Newsletter abbestellen", robots: { index: false } };

/** Bestätigung zum Abmelden vom Newsletter einer Creatorin (Link aus der Mail) */
export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = flatSearchParams(await searchParams);
  const ctx = await unsubscribeContext(t);
  return (
    <>
      <p className="spec mb-3">Newsletter</p>
      <h1 className="display text-5xl">{ctx ? "Newsletter abbestellen" : "Link ungültig"}</h1>
      {ctx ? (
        <>
          <p className="mt-3 text-muted">
            Du bekommst dann keine Newsletter-E-Mails mehr von {ctx.creatorName}. Du folgst {ctx.creatorName} weiterhin und siehst neue Inhalte wie gewohnt im Feed.
          </p>
          <NewsletterUnsubscribeButton token={t!} creatorName={ctx.creatorName} handle={ctx.handle} />
        </>
      ) : (
        <>
          <p className="mt-3 text-muted">Dieser Link ist nicht gültig. Newsletter kannst du nach der Anmeldung auf dem Profil der Creatorin oder in den Benachrichtigungen abbestellen.</p>
          <LinkButton href="/einstellungen/benachrichtigungen" size="lg" className="mt-8 w-full">
            Zu den Einstellungen
          </LinkButton>
        </>
      )}
    </>
  );
}
