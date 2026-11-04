import type { Metadata } from "next";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { listFlags, listSettings } from "@/server/admin/system";
import { AdminHeader, Table, Td, Th, Tr, EmptyRow } from "@/components/admin/ui";
import { FlagSwitch, NewFlagForm, SettingControl } from "@/components/admin/system-controls";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { dateTime } from "@/components/admin/format";
import { resetSettingAction, toggleFlagAction, updateSettingAction, upsertFlagAction } from "./actions";

export const metadata: Metadata = { title: "Systemkonfiguration" };

export default async function SystemPage() {
  const user = await adminPage("ADMIN", "/admin/system");
  const isSuper = hasRole(user, "SUPERADMIN");
  const [settings, flags] = await Promise.all([listSettings(), listFlags()]);
  const groups = [...new Set(settings.map((s) => s.meta.group))];

  return (
    <div>
      <AdminHeader n="13" title="Systemkonfiguration" description="Plattformweite Parameter und Feature-Flags. Jede Änderung wird mit altem und neuem Wert im Audit-Protokoll festgehalten und wirkt beim nächsten Request." />
      <Notice tone="warn" className="mb-8" title="Mit Bedacht ändern">
        Änderungen an Provision und Checkout betreffen laufende Verkäufe sofort. Provisionsänderungen müssen Verkäufern vorab angekündigt werden (Marktplatz-Richtlinien) und sind der Superadministration vorbehalten.
      </Notice>

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
                    locked={s.key === "commerce.feeBps" && !isSuper ? "Nur Superadministration" : undefined}
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
        <Table className="mt-3" caption="Feature-Flags">
          <thead>
            <tr>
              <Th>Schlüssel</Th>
              <Th>Beschreibung</Th>
              <Th align="right">Rollout</Th>
              <Th>Geändert</Th>
              <Th align="right">Aktiv</Th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 && <EmptyRow cols={5}>Noch keine Feature-Flags.</EmptyRow>}
            {flags.map((f) => (
              <Tr key={f.key}>
                <Td mono className="font-semibold">{f.key}</Td>
                <Td className="text-ink-2">{f.description || "–"}</Td>
                <Td align="right">{f.rollout} %</Td>
                <Td className="whitespace-nowrap text-muted">{dateTime(f.updatedAt)}</Td>
                <Td align="right">
                  <FlagSwitch flagKey={f.key} enabled={f.enabled} toggle={toggleFlagAction} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-5 border border-line bg-card p-4 rounded-2xl">
          <p className="spec mb-3">Neues Flag (startet deaktiviert)</p>
          <NewFlagForm action={upsertFlagAction} />
        </div>
      </section>
    </div>
  );
}
