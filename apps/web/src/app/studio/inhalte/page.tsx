import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { listOwnContent, type OwnContentState, type OwnContentType } from "@/server/analytics/studio";
import { EmptyRow, Segments, Table, Td, Th, Tr } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Meine Inhalte" };

const TYPES: { key: OwnContentType | "all"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "post", label: "Beiträge" },
  { key: "project", label: "Projekte" },
  { key: "tutorial", label: "Anleitungen" },
  { key: "article", label: "Artikel" },
  { key: "product", label: "Produkte" },
];
const TYPE_LABEL: Record<OwnContentType, string> = { post: "Beitrag", project: "Projekt", tutorial: "Anleitung", article: "Artikel", product: "Produkt" };
const STATES: { key: OwnContentState | "all"; label: string }[] = [
  { key: "all", label: "Alle Zustände" },
  { key: "draft", label: "Entwürfe" },
  { key: "published", label: "Veröffentlicht" },
  { key: "archived", label: "Archiviert" },
];

export default async function StudioContentPage({ searchParams }: { searchParams: Promise<{ typ?: string; zustand?: string }> }) {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/inhalte");
  const sp = await searchParams;
  const type = (TYPES.find((t) => t.key === sp.typ)?.key ?? "all") as OwnContentType | "all";
  const state = (STATES.find((s) => s.key === sp.zustand)?.key ?? "all") as OwnContentState | "all";
  const { rows, hasShop } = await listOwnContent(user.id, user.profile.handle, { type: type === "all" ? null : type, state: state === "all" ? null : state });
  const href = (t: string, s: string) => `/studio/inhalte?${new URLSearchParams({ ...(t !== "all" ? { typ: t } : {}), ...(s !== "all" ? { zustand: s } : {}) })}`;

  return (
    <div className="max-w-[1100px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />Alles an einem Ort</p>
          <h1 className="display text-[2.4rem] sm:text-5xl">Meine Inhalte</h1>
        </div>
        <LinkButton href="/erstellen" variant="ink">Neu erstellen</LinkButton>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Segments active={type} items={TYPES.filter((t) => t.key !== "product" || hasShop).map((t) => ({ key: t.key, label: t.label, href: href(t.key, state) }))} />
        <Segments active={state} items={STATES.map((s) => ({ key: s.key, label: s.label, href: href(type, s.key) }))} />
      </div>

      <Table caption="Eigene Inhalte">
        <thead>
          <tr>
            <Th>Art</Th>
            <Th>Titel</Th>
            <Th>Zustand</Th>
            <Th>Details</Th>
            <Th>Geändert</Th>
            <Th align="right"><span className="sr-only">Aktionen</span></Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <EmptyRow cols={6}>
              {state === "draft" ? "Keine Entwürfe – alles ist draussen in der Welt." : "Hier ist noch nichts. "}
              {state !== "draft" && <Link href="/erstellen" className="font-semibold text-ink underline">Leg los</Link>}
            </EmptyRow>
          )}
          {rows.map((r) => (
            <Tr key={`${r.type}:${r.id}`}>
              <Td className="whitespace-nowrap"><span className="spec">{TYPE_LABEL[r.type]}</span></Td>
              <Td className="max-w-[380px]">
                {r.href ? (
                  <Link href={r.href} className="line-clamp-1 font-semibold hover:underline">{r.title}</Link>
                ) : (
                  <span className="line-clamp-1 font-semibold">{r.title}</span>
                )}
              </Td>
              <Td className="whitespace-nowrap">
                <Badge tone={r.state === "published" ? "moss" : r.state === "draft" ? "neutral" : r.stateLabel.startsWith("Entfernt") ? "danger" : "outline"}>{r.stateLabel}</Badge>
              </Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{r.meta ?? "–"}</Td>
              <Td className="whitespace-nowrap text-muted">{relativeTime(r.updatedAt)}</Td>
              <Td align="right">
                <Link href={r.manageHref} className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
                  Verwalten
                </Link>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {rows.some((r) => r.stateLabel.startsWith("Entfernt")) && (
        <p className="mt-4 text-xs text-muted">
          Von der Moderation entfernte Inhalte siehst nur du. Gegen eine Entscheidung kannst du über den Link in der Benachrichtigung innerhalb von 14 Tagen Einspruch erheben.
        </p>
      )}
    </div>
  );
}
