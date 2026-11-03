import { LinkButton } from "@/components/ui/button";
import { verifyEmail } from "@/server/identity/service";

export const metadata = { title: "E-Mail bestätigen", robots: { index: false } };

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await verifyEmail(token);
  return (
    <>
      <p className="spec mb-3">E-Mail-Bestätigung</p>
      <h1 className="display text-5xl">{ok ? "Bestätigt." : "Link ungültig"}</h1>
      <p className="mt-3 text-muted">
        {ok
          ? "Danke! Deine E-Mail-Adresse ist bestätigt. Du kannst jetzt alle Funktionen nutzen."
          : "Dieser Link ist abgelaufen oder wurde bereits verwendet. Du kannst in den Einstellungen einen neuen anfordern."}
      </p>
      <LinkButton href={ok ? "/feed" : "/einstellungen/konto"} size="lg" className="mt-8 w-full">
        {ok ? "Zum Feed" : "Zu den Einstellungen"}
      </LinkButton>
    </>
  );
}
