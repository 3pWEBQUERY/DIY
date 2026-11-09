import type { Metadata } from "next";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { listFlags, listSettings } from "@/server/admin/system";
import { AdminHeader, Table, Td, Th, Tr, EmptyRow } from "@/components/admin/ui";
import { FlagRollout, FlagSwitch, SettingControl } from "@/components/admin/system-controls";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { MailTestButton } from "@/components/admin/mail-test";
import { mailStatus } from "@/server/mail";
import { dateTime } from "@/components/admin/format";
import { resetSettingAction, setFlagRolloutAction, toggleFlagAction, updateSettingAction } from "./actions";

export const metadata: Metadata = { title: "Systemkonfiguration" };

export default async function SystemPage() {
  const user = await adminPage("ADMIN", "/admin/system");
  const isSuper = hasRole(user, "SUPERADMIN");
  const [settings, flags, mail] = await Promise.all([listSettings(), listFlags(), mailStatus()]);
  const groups = [...new Set(settings.map((s) => s.meta.group))];

  return (
    <div>
      <AdminHeader n="14" title="Systemkonfiguration" description="Plattformweite Parameter und Feature-Flags. Jede Änderung wird mit altem und neuem Wert im Audit-Protokoll festgehalten und wirkt beim nächsten Request." />
      <Notice tone="warn" className="mb-8" title="Mit Bedacht ändern">
        Änderungen an Provision und Checkout betreffen laufende Verkäufe sofort. Provisionsänderungen müssen Verkäufern vorab angekündigt werden (Marktplatz-Richtlinien) und sind der Superadministration vorbehalten.
      </Notice>

      <section className="mb-10 rounded-2xl border border-line bg-card p-5 sm:p-6" aria-labelledby="mail">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="mail" className="text-[15px] font-bold tracking-tight">E-Mail-Versand</h2>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-[13.5px] sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Dienst</dt>
              <dd>{mail.configured ? "Resend – Schlüssel gesetzt" : "Nicht eingerichtet"}</dd>
              <dt className="text-muted">Absender</dt>
              <dd className="font-mono text-[12.5px]">{mail.from}</dd>
              <dt className="text-muted">Domain</dt>
              <dd>
                {mail.domain ?? "–"}
                {mail.domainStatus && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${mail.domainStatus === "verified" ? "bg-moss-soft text-moss-ink" : "bg-warn-soft text-warn"}`}>
                    {mail.domainStatus === "verified" ? "bestätigt" : mail.domainStatus === "missing" ? "nicht eingerichtet" : mail.domainStatus}
                  </span>
                )}
              </dd>
            </dl>
          </div>
          {mail.configured && <MailTestButton />}
        </div>
        {mail.note && <Notice tone={mail.domainStatus === "verified" ? "neutral" : "warn"} className="mt-4">{mail.note}</Notice>}
      </section>

      {groups.map((g, gi) => (
        <section key={g} className="mb-10" aria-labelledby={`g${gi}`}>
          <SectionTitle n={String(gi + 1).padStart(2, "0")} title={<span id={`g${gi}`}>{g}</span>} />
          <ul className="divide-y divide-line">
            {settings
              .filter((s) => s.meta.group === g)
              .map((s) => (
                <li key={s.key} className="grid items-center gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <p className="text-sm font-semibold">{s.meta.label}</p>
                    <p className="text-[13px] text-muted">{s.meta.help}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {s.key}
                      {s.isDefault ? " · Standardwert" : ` · geändert ${dateTime(s.updatedAt)}`}
                    </p>
                  </div>
                  <SettingControl
                    settingKey={s.key}
                    value={s.value}
                    isDefault={s.isDefault}
                    defaultValue={s.default}
                    unit={s.meta.unit}
                    min={s.meta.min}
                    max={s.meta.max}
                    format={s.meta.format}
                    locked={(s.key === "commerce.feeBps" || s.key === "pro.feeBps") && !isSuper ? "Nur Superadministration" : undefined}
                    save={updateSettingAction}
                    reset={resetSettingAction}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="flags">
        <SectionTitle n={String(groups.length + 1).padStart(2, "0")} title={<span id="flags">Feature-Flags</span>} />
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Schalter für ganze Bereiche – wirken sofort, ohne Deploy, in Web und App. Mit einem Rollout unter 100 % gilt ein Flag nur für diesen Anteil der angemeldeten Konten (immer dieselben); Gäste sehen den Bereich dann nicht.
        </p>
        <Table className="mt-4" caption="Feature-Flags">
          <thead>
            <tr>
              <Th>Bereich</Th>
              <Th>Wirkung</Th>
              <Th align="right">Rollout</Th>
              <Th>Geändert</Th>
              <Th align="right">Aktiv</Th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <Tr key={f.key}>
                <Td>
                  <p className="font-semibold">{f.label}</p>
                  <p className="font-mono text-[11px] text-muted">{f.key}</p>
                </Td>
                <Td className="max-w-md text-[13px] text-ink-2">{f.description}</Td>
                <Td align="right">
                  <FlagRollout flagKey={f.key} rollout={f.rollout} save={setFlagRolloutAction} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{f.updatedAt ? dateTime(f.updatedAt) : "Standard"}</Td>
                <Td align="right">
                  <FlagSwitch flagKey={f.key} enabled={f.enabled} toggle={toggleFlagAction} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
