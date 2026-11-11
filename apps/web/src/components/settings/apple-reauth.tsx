import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

/**
 * Konten ohne Passwort (nur „Mit Apple“ bzw. „Mit Pinterest anmelden“) bestätigen kritische Schritte mit
 * einer frischen Anmeldung beim verknüpften Anbieter (/api/auth/reauth wählt ihn). Danach führt die
 * Anmeldung hierher zurück; der Schritt ist dann 10 Minuten lang möglich.
 */
export function AppleReauthNotice({ returnTo, action }: { returnTo: string; action: string }) {
  return (
    <Notice tone="warn" title="Kurz neu anmelden">
      <p>Du hast kein Passwort. Damit niemand mit einer fremden Sitzung {action}, meldest du dich dafür einmal neu an (mit Apple bzw. Pinterest). Danach hast du 10 Minuten Zeit.</p>
      <a href={`/api/auth/reauth?weiter=${encodeURIComponent(returnTo)}`} className={buttonClass("ink", "sm", "mt-3")}>
        Erneut anmelden
      </a>
    </Notice>
  );
}
