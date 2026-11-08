import type { ReactNode } from "react";
import { currentUser } from "@/server/auth/session";
import { flagEnabled, flagPausedMessage, type FlagKey } from "@/server/flags";
import { Empty } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

/** Hinweis statt Inhalt, wenn ein Bereich per Feature-Flag pausiert ist. */
export function FeaturePaused({ flag, back = { href: "/feed", label: "Zum Feed" } }: { flag: FlagKey; back?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="spec mb-3 text-center">Vorübergehend pausiert</p>
      <Empty title="Gerade nicht verfügbar" body={flagPausedMessage(flag)} action={<LinkButton href={back.href} variant="outline">{back.label}</LinkButton>} />
    </div>
  );
}

/** Layout-Hülle: rendert die Seite nur, wenn das Flag für die Person aktiv ist. */
export async function FeatureGate({ flag, children, back }: { flag: FlagKey; children: ReactNode; back?: { href: string; label: string } }) {
  const user = await currentUser();
  if (!(await flagEnabled(flag, user?.id))) return <FeaturePaused flag={flag} back={back} />;
  return <>{children}</>;
}
