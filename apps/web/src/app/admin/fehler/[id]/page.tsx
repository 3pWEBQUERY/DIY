import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppError } from "@/server/errors";
import { adminPage } from "@/server/admin/guard";
import { getErrorGroup } from "@/server/admin/errors";
import { SOURCE_LABEL, type ErrorSource } from "@/server/monitoring";
import { deviceLabel } from "@/server/auth/session";
import { ActionButton } from "@/components/admin/action-controls";
import { Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, num } from "@/components/admin/format";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { setErrorStateAction } from "../actions";

export const metadata: Metadata = { title: "Fehler" };
export const dynamic = "force-dynamic";

export default async function ErrorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await adminPage("ADMIN", `/admin/fehler/${id}`);
  let d;
  try {
    d = await getErrorGroup(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { group: g, occurrences, perDay } = d;
  const max = Math.max(1, ...perDay.map((p) => p.n));
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86400_000);
    const key = day.toISOString().slice(0, 10);
    return { key, n: perDay.find((p) => p.day.toISOString().slice(0, 10) === key)?.n ?? 0 };
  });
  const state = g.ignoredAt ? "ignored" : g.resolvedAt ? "resolved" : "open";

  return (
    <div>
      <Link href="/admin/fehler" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Fehler
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="min-w-0 max-w-3xl">
          <p className="spec mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={g.source === "SERVER" ? "danger" : g.source === "WORKER" ? "warn" : "neutral"}>{SOURCE_LABEL[g.source as ErrorSource] ?? g.source}</Badge>
            {state === "open" && <Badge tone="danger">Offen</Badge>}
            {state === "resolved" && <Badge tone="moss">Erledigt</Badge>}
            {state === "ignored" && <Badge>Ignoriert</Badge>}
          </p>
          <h1 className="display text-[2rem] break-words">{g.name}</h1>
          <p className="mt-2 break-words text-ink-2">{g.message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state !== "resolved" && <ActionButton action={setErrorStateAction.bind(null, g.id, "resolve")} label="Als erledigt markieren" variant="primary" />}
          {state !== "open" && <ActionButton action={setErrorStateAction.bind(null, g.id, "reopen")} label="Wieder öffnen" />}
          {state !== "ignored" && <ActionButton action={setErrorStateAction.bind(null, g.id, "ignore")} label="Ignorieren" variant="ghost" confirm="Diesen Fehler ignorieren? Er wird weiter gezählt, meldet sich aber nicht mehr." />}
        </div>
      </header>

      <dl className="mb-10 grid grid-cols-2 gap-y-4 sm:grid-cols-5">
        {[
          ["Vorkommen", num(g.count)],
          ["Betroffene Personen", num(g.usersHit)],
          ["Erstmals", dateTime(g.firstSeenAt)],
          ["Zuletzt", dateTime(g.lastSeenAt)],
          ["Version", g.release ?? "–"],
        ].map(([l, v]) => (
          <div key={l} className="border-l border-line pl-4">
            <dt className="spec">{l}</dt>
            <dd className="mt-1 text-[15px] font-semibold num">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mb-10" aria-labelledby="e1">
        <SectionTitle n="01" title={<span id="e1">Verlauf (14 Tage)</span>} />
        <div className="mt-4 flex h-24 items-end gap-1.5" role="img" aria-label="Vorkommen pro Tag">
          {days.map((x) => (
            <div key={x.key} className="flex flex-1 flex-col items-center gap-1" title={`${x.key}: ${x.n}`}>
              <div className={`w-full rounded-md ${x.n ? "bg-moss" : "bg-sunken"}`} style={{ height: `${Math.max(4, (x.n / max) * 80)}px` }} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10" aria-labelledby="e2">
        <SectionTitle n="02" title={<span id="e2">Stacktrace (letztes Vorkommen)</span>} />
        {g.stack ? (
          <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-line bg-card p-4 font-mono text-[12px] leading-relaxed text-ink-2">{g.stack}</pre>
        ) : (
          <Notice className="mt-4">Kein Stacktrace vorhanden.</Notice>
        )}
      </section>

      <section aria-labelledby="e3">
        <SectionTitle n="03" title={<span id="e3">Letzte Vorkommen</span>} />
        <Table className="mt-3" caption="Letzte Vorkommen">
          <thead>
            <tr>
              <Th>Zeit</Th>
              <Th>Pfad</Th>
              <Th>Person</Th>
              <Th>Gerät</Th>
              <Th>Version</Th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map((o) => {
              return (
                <Tr key={o.id}>
                  <Td className="whitespace-nowrap">{dateTime(o.createdAt)}</Td>
                  <Td mono className="max-w-[280px] truncate text-[12px]">{o.method ? `${o.method} ` : ""}{o.path ?? "–"}</Td>
                  <Td>{o.userId ? <Link href={`/admin/nutzer/${o.userId}`} className="hover:underline">{o.handle ? `@${o.handle}` : "Konto"}</Link> : <span className="text-muted">Gast</span>}</Td>
                  <Td className="text-[13px] text-ink-2">{o.userAgent ? deviceLabel(o.userAgent) : "–"}</Td>
                  <Td mono className="text-[12px] text-muted">{o.release ?? "–"}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
