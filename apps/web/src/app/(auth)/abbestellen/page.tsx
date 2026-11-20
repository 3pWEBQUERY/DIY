import { LinkButton } from "@/components/ui/button";
import { listFromParam, verifyUnsubscribeToken } from "@/server/mail-unsubscribe";
import { UnsubscribeButton } from "./unsubscribe-button";
import { flatSearchParams } from "@/lib/search-params";

export const metadata = { title: "E-Mails abbestellen", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string | string[]; liste?: string | string[] }> }) {
  const { t, liste } = flatSearchParams(await searchParams);
  const list = listFromParam(liste);
  const valid = !!verifyUnsubscribeToken(t, list);
  return (
    <>
      <p className="spec mb-3">Benachrichtigungen</p>
      <h1 className="display text-5xl">{valid ? (list === "weekly" ? "Wochenrückblick abbestellen" : "E-Mails abbestellen") : "Link ungültig"}</h1>
      {valid ? (
        <>
          <p className="mt-3 text-muted">
            {list === "weekly"
              ? "Du bekommst dann keine wöchentliche Zusammenfassung mit neuen Projekten und Anleitungen mehr. Benachrichtigungen per E-Mail bleiben, wie du sie eingestellt hast."
              : "Du bekommst dann keine E-Mails mehr zu Likes, Kommentaren, Followern und anderen Neuigkeiten. Wichtige Mails zu Sicherheit, Bestellungen und Moderation erhältst du weiterhin."}
          </p>
          <UnsubscribeButton token={t!} list={list} />
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
