import { VerifyEmailButton } from "./verify-button";

export const metadata = { title: "E-Mail bestätigen", robots: { index: false } };

/** Bestätigt erst auf Klick: Link-Vorschauen und Virenscanner öffnen Mail-Links per GET und würden ihn sonst verbrauchen. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <p className="spec mb-3">E-Mail-Bestätigung</p>
      <VerifyEmailButton token={token} />
    </>
  );
}
