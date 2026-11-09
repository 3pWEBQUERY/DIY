import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Monitor, Smartphone, ShieldCheck } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { listSessions, securityEvents } from "@/server/account/service";
import { notificationText } from "@/server/notifications-format";
import { SettingsSection } from "@/components/settings/section";
import { RevokeOthersButton, RevokeSessionButton, SignOutButton } from "@/components/settings/session-controls";
import { Badge, Notice } from "@/components/ui/misc";
import { formatDate, relativeTime } from "@/lib/utils";
import { BrowserLogo } from "@/components/settings/browser-logo";
import { ConfirmSessionMfa, TwoFactorSettings } from "@/components/settings/two-factor";
import { mfaRequiredFor, mfaStatus } from "@/server/auth/mfa";
import { isFreshLogin } from "@/server/auth/reauth";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sicherheit" };
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ zweifaktor?: string; weiter?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect("/anmelden?weiter=/einstellungen/sicherheit");
  const [sessions, events, mfa] = await Promise.all([listSessions(s.user.id, s.sessionId), securityEvents(s.user.id), mfaStatus(s.user.id)]);
  const mfaRequired = mfaRequiredFor(s.user);
  const others = sessions.filter((x) => !x.current).length;
  // 2FA aktiv, aber diese Sitzung hat den Code nie bestätigt (z. B. vor dem Aktivieren angemeldet)
  const needsSessionConfirm = mfa.enabled && !s.user.mfaVerified && (mfaRequired || sp.zweifaktor === "bestaetigen");

  return (
    <div>
      {mfaRequired && !mfa.enabled && (
        <Notice tone={sp.zweifaktor === "pflicht" ? "danger" : "warn"} title="Zwei-Faktor-Anmeldung einrichten" className="mb-10">
          Dein Konto hat Moderations- oder Admin-Rechte. Damit niemand mit einem erratenen oder gestohlenen Passwort darauf zugreifen kann, ist ein zweiter Faktor Pflicht. Bis er eingerichtet ist, sind Admin-Bereich und Moderationswerkzeuge gesperrt.
        </Notice>
      )}
      {needsSessionConfirm && (
        <Notice tone={sp.zweifaktor === "bestaetigen" ? "danger" : "warn"} title="Diese Sitzung bestätigen" className="mb-10">
          <p>Du warst schon angemeldet, bevor die Zwei-Faktor-Anmeldung aktiv war. Admin-Bereich und Moderationswerkzeuge sind erst nach dem Code aus deiner Authenticator-App freigeschaltet.</p>
          <ConfirmSessionMfa next={safeNext(sp.weiter)} />
        </Notice>
      )}
      <SettingsSection
        n="01"
        id="zwei-faktor"
        title="Zwei-Faktor-Anmeldung"
        description="Zusätzlich zum Passwort fragen wir bei der Anmeldung nach einem Code aus einer Authenticator-App. Selbst wer dein Passwort kennt, kommt so nicht in dein Konto."
      >
        <TwoFactorSettings
          enabled={mfa.enabled}
          enabledAt={mfa.enabledAt?.toISOString() ?? null}
          recoveryCodesLeft={mfa.recoveryCodesLeft}
          required={mfaRequired}
          email={s.user.email}
          hasPassword={mfa.hasPassword}
          reauthFresh={isFreshLogin(s.sessionCreatedAt)}
        />
      </SettingsSection>

      <SettingsSection
        n="02"
        title="Angemeldete Geräte"
        description="Alle Geräte und Browser, auf denen du gerade angemeldet bist. Kommt dir etwas unbekannt vor, beende die Sitzung und ändere dein Passwort."
      >
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card px-4">
          {sessions.map((x) => {
            const Icon = x.isApp || /iOS|Android/.test(x.device) ? Smartphone : Monitor;
            return (
              <li key={x.key} className="flex flex-wrap items-center gap-4 py-3.5">
                <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-paper">
                  <BrowserLogo browser={x.browser} size={24} />
                  <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-card bg-sunken text-ink-2" title={Icon === Smartphone ? "Mobilgerät" : "Computer"}>
                    <Icon size={10} strokeWidth={2} aria-hidden />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {x.device}
                    {x.current && <Badge tone="moss">Dieses Gerät</Badge>}
                  </span>
                  <span className="block text-xs text-muted">
                    Zuletzt aktiv {relativeTime(x.lastUsedAt)} · angemeldet seit {formatDate(x.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                {x.current ? <SignOutButton /> : <RevokeSessionButton sessionKey={x.key} device={x.device} />}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <RevokeOthersButton count={others} />
          <span className="text-xs text-muted">Sitzungen laufen nach 30 Tagen ohne Aktivität automatisch ab.</span>
        </div>
      </SettingsSection>

      <SettingsSection n="03" title="Sicherheitsereignisse" description="Anmeldungen von neuen Geräten, Passwortänderungen und beendete Sitzungen.">
        {events.length ? (
          <ol className="border-l border-rule pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative pb-4 before:absolute before:-left-[24.5px] before:top-1.5 before:size-2 before:bg-rule-strong rounded-full">
                <p className="text-sm">{notificationText({ type: "SECURITY", count: 1, data: e.data })}</p>
                <p className="spec mt-0.5">{relativeTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Keine Ereignisse in letzter Zeit.</p>
        )}
      </SettingsSection>

      <SettingsSection n="04" title="Empfehlungen">
        <Notice tone="moss" title="So schützt du dein Konto">
          <ul className="mt-1 space-y-1">
            <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> Nutze ein Passwort, das du nirgends sonst verwendest.</li>
            <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> Wir fragen nie per Nachricht oder E-Mail nach deinem Passwort oder nach Zahlungen ausserhalb des Checkouts.</li>
            <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> Verdächtige Nachrichten kannst du direkt im Chat melden.</li>
          </ul>
        </Notice>
        <p className="mt-3 text-sm">
          <Link href="/einstellungen/konto" className="font-semibold underline underline-offset-2">Passwort ändern</Link>
        </p>
      </SettingsSection>
    </div>
  );
}
