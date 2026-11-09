import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requirePageUser } from "@/server/auth/session";
import { accountOverview } from "@/server/account/service";
import { SettingsSection } from "@/components/settings/section";
import { ChangePasswordForm, DeleteAccountButton, ResendVerificationButton } from "@/components/settings/account-forms";
import { Badge, Notice } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getCustomerDetails } from "@/server/account/customer";
import { CustomerDetailsForm } from "@/components/settings/customer-details-form";

export const metadata: Metadata = { title: "Konto & Daten" };

export default async function AccountSettingsPage() {
  const user = await requirePageUser("/einstellungen/konto", { allowSuspended: true });
  const [a, details] = await Promise.all([accountOverview(user.id), getCustomerDetails(user.id)]);

  return (
    <div>
      <SettingsSection n="01" title="E-Mail-Adresse" description="An diese Adresse senden wir Sicherheitshinweise, Bestellbestätigungen und – falls aktiviert – Benachrichtigungen. Sie ist nie öffentlich sichtbar.">
        <div className="flex flex-wrap items-center gap-3 border border-line bg-card px-4 py-3 rounded-2xl">
          <span className="font-mono text-[14px]">{a.email}</span>
          {a.emailVerifiedAt ? <Badge tone="moss">Bestätigt</Badge> : <Badge tone="warn">Nicht bestätigt</Badge>}
          {!a.emailVerifiedAt && (
            <span className="ml-auto">
              <ResendVerificationButton />
            </span>
          )}
        </div>
        {a.providers.includes("apple") && <p className="mt-2 text-xs text-muted">Du meldest dich (auch) mit Apple an.</p>}
        <p className="mt-2 text-xs text-muted">Mitglied seit {formatDate(a.createdAt)}.</p>
      </SettingsSection>

      <SettingsSection n="02" title={a.hasPassword ? "Passwort ändern" : "Passwort festlegen"} description={a.hasPassword ? undefined : "Du meldest dich bisher nur mit Apple an. Mit einem Passwort kannst du dich zusätzlich per E-Mail anmelden."}>
        <ChangePasswordForm hasPassword={a.hasPassword} />
      </SettingsSection>

      <SettingsSection
        n="03"
        id="angaben"
        title="Angaben für Bestellungen"
        description="Name und Adresse für Rechnung und Versand. Sie werden bei jeder Bestellung verwendet und nur an den Shop weitergegeben, bei dem du bestellst – nie öffentlich angezeigt."
      >
        <CustomerDetailsForm initial={details} />
      </SettingsSection>

      <SettingsSection n="04" title="Deine Daten herunterladen" description="Du hast jederzeit das Recht auf Auskunft und Datenübertragbarkeit. Der Export enthält alles, was wir zu deinem Konto speichern: Profil und Einstellungen, Beiträge, Projekte, Anleitungen, Artikel, Kommentare, Likes, Sammlungen, Einkaufslisten und Bestand, Communities, Events und Wettbewerbe, Shop, Bestellungen und Bewertungen, Abo, angemeldete Geräte, Meldungen und Support-Anfragen sowie deine gesendeten Nachrichten – als maschinenlesbare JSON-Datei. Passwort und Sicherheitsschlüssel sind aus Sicherheitsgründen nicht enthalten.">
        <a href="/api/v1/me/export" download className={buttonClass("outline", "md")}>
          <Download size={16} aria-hidden /> Datenexport herunterladen (JSON)
        </a>
        <p className="mt-2 text-xs text-muted">Medien (Fotos, Videos) sind als Links enthalten. Der Export wird bei jedem Klick neu erstellt.</p>
      </SettingsSection>

      <SettingsSection n="05" title="Konto löschen" id="loeschen">
        <div className="grid gap-6 border border-danger/30 p-5 sm:grid-cols-2 rounded-2xl">
          <div>
            <p className="spec mb-2 text-danger">Wird gelöscht bzw. entfernt</p>
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>Profil, Bio, Profil- und Titelbild, Links</li>
              <li>Beiträge, Projekte, Anleitungen und Kommentare (nicht mehr sichtbar)</li>
              <li>Blogartikel (verborgen)</li>
              <li>Follower- und Folgebeziehungen</li>
              <li>Alle Sitzungen und verknüpften Anmeldungen (z.B. Apple)</li>
              {a.hasShop && <li>Dein Shop wird gesperrt, Produkte werden deaktiviert</li>}
            </ul>
          </div>
          <div>
            <p className="spec mb-2">Bleibt erhalten</p>
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>
                Bestellungen und Rechnungsdaten{a.orderCount ? ` (${a.orderCount})` : ""} – gesetzliche Aufbewahrungspflicht von 10 Jahren (Art. 958f OR), vom Profil entkoppelt
              </li>
              <li>Moderationsentscheidungen und Audit-Einträge in pseudonymisierter Form</li>
              <li>Gesendete Nachrichten bleiben im Verlauf deiner Gesprächspartner sichtbar – als „Gelöschtes Konto“</li>
            </ul>
          </div>
          <Notice tone="danger" className="sm:col-span-2" title="Endgültig">
            Die Löschung kann nicht rückgängig gemacht werden. Dein Handle wird freigegeben. Lade vorher deinen Datenexport herunter, wenn du deine Projekte behalten möchtest.
          </Notice>
          <div className="sm:col-span-2">
            <DeleteAccountButton hasPassword={a.hasPassword} />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
