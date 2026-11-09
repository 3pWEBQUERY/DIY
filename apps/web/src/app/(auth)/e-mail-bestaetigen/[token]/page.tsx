import { LinkButton } from "@/components/ui/button";
import { confirmEmailChange } from "@/server/account/email-change";

export const metadata = { title: "Neue E-Mail-Adresse bestätigen", robots: { index: false } };

export default async function ConfirmEmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await confirmEmailChange(token);
  return (
    <>
      <p className="spec mb-3">E-Mail-Adresse</p>
      <h1 className="display text-5xl">{email ? "Geändert." : "Link ungültig"}</h1>
      <p className="mt-3 text-muted">
        {email
          ? `Deine E-Mail-Adresse lautet jetzt ${email}. Melde dich ab sofort damit an.`
          : "Dieser Link ist abgelaufen, wurde bereits verwendet oder die Adresse ist inzwischen vergeben. Du kannst die Änderung in den Einstellungen neu anfordern."}
      </p>
      <LinkButton href="/einstellungen/konto" size="lg" className="mt-8 w-full">
        Zu den Einstellungen
      </LinkButton>
    </>
  );
}
