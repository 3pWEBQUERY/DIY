"use client";

import { useState } from "react";
import { EMAIL_DIGEST, EMAIL_DIGEST_LABEL, NOTIFICATION_LABEL, type EmailDigest, type NotificationType } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./section";
import { updateNotificationPrefsAction } from "@/app/(app)/einstellungen/actions";

type Row = { type: NotificationType; inApp: boolean; email: boolean; locked: boolean };

const GROUPS: { title: string; types: NotificationType[] }[] = [
  { title: "Community", types: ["FOLLOW", "LIKE", "COMMENT", "REPLY", "MENTION", "NEW_POST_FROM_FOLLOWED", "COMMUNITY_INVITE"] },
  { title: "Projekte & Anleitungen", types: ["PROJECT_ACTIVITY", "REMIX", "TUTORIAL_UPDATED"] },
  { title: "Nachrichten & Shop", types: ["MESSAGE", "ORDER_NEW", "ORDER_STATUS"] },
  { title: "Konto", types: ["SECURITY", "MODERATION"] },
];

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="size-[18px] cursor-pointer appearance-none border border-line-strong bg-card checked:border-moss checked:bg-moss disabled:cursor-not-allowed disabled:opacity-60 grid place-content-center before:size-2.5 before:scale-0 before:bg-paper before:content-[''] before:[clip-path:polygon(14%_44%,0_65%,50%_100%,100%_16%,80%_0%,43%_62%)] checked:before:scale-100 rounded-xl"
    />
  );
}

export function NotificationMatrix({ rows, digest: initialDigest }: { rows: Row[]; digest: string }) {
  const [state, setState] = useState(() => Object.fromEntries(rows.map((r) => [r.type, { inApp: r.inApp, email: r.email }])) as Record<NotificationType, { inApp: boolean; email: boolean }>);
  const [digest, setDigest] = useState<EmailDigest>((EMAIL_DIGEST as readonly string[]).includes(initialDigest) ? (initialDigest as EmailDigest) : "DAILY");
  const locked = new Set(rows.filter((r) => r.locked).map((r) => r.type));
  const { run, pending } = useAction(updateNotificationPrefsAction);
  const set = (t: NotificationType, k: "inApp" | "email", v: boolean) => setState((s) => ({ ...s, [t]: { ...s[t], [k]: v } }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({ prefs: state, emailDigest: digest });
      }}
    >
      <SettingsSection n="01" title="Ereignisse & Kanäle" description="Wähle pro Ereignis, ob es in der App erscheint und ob du zusätzlich eine E-Mail bekommst. Sicherheits- und Moderationshinweise erscheinen immer in der App.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <caption className="sr-only">Benachrichtigungen je Ereignis und Kanal</caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="spec py-2 text-left font-normal">Ereignis</th>
                <th scope="col" className="spec w-20 py-2 text-center font-normal">In-App</th>
                <th scope="col" className="spec w-20 py-2 text-center font-normal">E-Mail</th>
              </tr>
            </thead>
            {GROUPS.map((g) => (
              <tbody key={g.title}>
                <tr>
                  <th scope="rowgroup" colSpan={3} className="pb-1 pt-5 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
                    {g.title}
                  </th>
                </tr>
                {g.types.map((t) => (
                  <tr key={t} className="border-b border-line">
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                      {NOTIFICATION_LABEL[t]}
                      {locked.has(t) && <span className="ml-2 text-xs text-muted">immer in der App</span>}
                    </th>
                    <td className="text-center">
                      <span className="inline-grid">
                        <Toggle checked={locked.has(t) || state[t].inApp} disabled={locked.has(t)} onChange={(v) => set(t, "inApp", v)} label={`${NOTIFICATION_LABEL[t]} in der App`} />
                      </span>
                    </td>
                    <td className={cn("text-center", digest === "OFF" && "opacity-50")}>
                      <span className="inline-grid">
                        <Toggle checked={state[t].email} onChange={(v) => set(t, "email", v)} label={`${NOTIFICATION_LABEL[t]} per E-Mail`} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </SettingsSection>

      <SettingsSection n="02" title="E-Mail-Rhythmus" description="Gebündelte E-Mails fassen alles seit der letzten Mail zusammen. Sicherheitshinweise und Bestellungen senden wir immer sofort.">
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">E-Mail-Rhythmus</legend>
          {EMAIL_DIGEST.map((d) => (
            <label key={d} className={cn("flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-sm rounded-2xl", digest === d ? "border-ink bg-card" : "border-line-strong hover:border-ink")}>
              <input type="radio" name="digest" value={d} checked={digest === d} onChange={() => setDigest(d)} className="accent-[var(--color-ink)]" />
              {EMAIL_DIGEST_LABEL[d]}
            </label>
          ))}
        </fieldset>
      </SettingsSection>

      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Speichert …" : "Einstellungen speichern"}
        </Button>
      </div>
    </form>
  );
}
