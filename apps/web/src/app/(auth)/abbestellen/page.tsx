import { LinkButton } from "@/components/ui/button";
import { verifyUnsubscribeToken } from "@/server/mail-unsubscribe";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata = { title: "E-Mails abbestellen", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const valid = !!verifyUnsubscribeToken(t);
  return (
    <>
      <p className="spec mb-3">Benachrichtigungen</p>
      <h1 className="display text-5xl">{valid ? "E-Mails abbestellen" : "Link ungültig"}</h1>
      {valid ? (
        <>
          <p className="mt-3 text-muted">
            Du bekommst dann keine E-Mails mehr zu Likes, Kommentaren, Followern und anderen Neuigkeiten. Wichtige Mails zu Sicherheit, Bestellungen und Moderation erhältst du weiterhin.
          </p>
          <UnsubscribeButton token={t!} />
        </>
      ) : (
        <>
          <p className="mt-3 text-muted">Dieser Link ist nicht gültig. Deine E-Mail-Einstellungen kannst du nach der Anmeldung jederzeit anpassen.</p>
          <LinkButton href="/einstellungen/benachrichtigungen" size="lg" className="mt-8 w-full">
            Zu den Einstellungen
          </LinkButton>
        </>
      )}
    </>
  );
}
