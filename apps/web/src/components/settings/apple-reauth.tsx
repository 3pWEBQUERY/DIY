import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

/**
 * Konten ohne Passwort (nur „Mit Apple anmelden“) bestätigen kritische Schritte mit einer frischen
 * Anmeldung bei Apple. Danach führt Apple hierher zurück; der Schritt ist dann 10 Minuten lang möglich.
 */
export function AppleReauthNotice({ returnTo, action }: { returnTo: string; action: string }) {
  return (
    <Notice tone="warn" title="Kurz mit Apple bestätigen">
      <p>Du hast kein Passwort. Damit niemand mit einer fremden Sitzung {action}, meldest du dich dafür einmal neu mit Apple an. Danach hast du 10 Minuten Zeit.</p>
      <a href={`/api/auth/apple?weiter=${encodeURIComponent(returnTo)}`} className={buttonClass("ink", "sm", "mt-3")}>
        Mit Apple bestätigen
      </a>
    </Notice>
  );
}
