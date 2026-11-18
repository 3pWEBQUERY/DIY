import { ConfirmEmailChangeButton } from "./confirm-button";

export const metadata = { title: "Neue E-Mail-Adresse bestätigen", robots: { index: false } };

/** Stellt erst auf Klick um: Link-Vorschauen und Virenscanner öffnen Mail-Links per GET und würden ihn sonst verbrauchen. */
export default async function ConfirmEmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <p className="spec mb-3">E-Mail-Adresse</p>
      <ConfirmEmailChangeButton token={token} />
    </>
  );
}
