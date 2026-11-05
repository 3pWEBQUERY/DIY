import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { MODERATION_ACTION_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, PRODUCT_KIND_LABEL, PRODUCT_STATUS_LABEL, formatMoney, type Currency, type ModerationActionKind, type ProductKind } from "@werkraum/shared";
import { CASE_STATUS_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { reasonLabel } from "@/server/moderation/service";
import { EmptyRow, RiskMeter, Table, Td, Th, Tr } from "@/components/admin/ui";
import { ReasonButton } from "@/components/admin/action-controls";
import { Badge } from "@/components/ui/misc";
import { dateTime, shortDate } from "@/components/admin/format";
import { cn } from "@/lib/utils";
import { setReviewHiddenAction } from "./actions";

/** Gemeinsame Bausteine der Marktplatz-Verwaltung (Liste, Shop- und Produktdetail). */

type Tone = "moss" | "warn" | "danger" | "neutral" | "clay";

export const SHOP_STATUS: Record<string, string> = { DRAFT: "Entwurf", PENDING_VERIFICATION: "Prüfung ausstehend", ACTIVE: "Aktiv", PAUSED: "Pausiert", SUSPENDED: "Gesperrt" };
export const VERIF: Record<string, string> = { NOT_STARTED: "nicht gestartet", PENDING: "beim Provider", VERIFIED: "verifiziert", REJECTED: "abgelehnt" };
export const shopTone = (s: string) => (s === "ACTIVE" ? "moss" : s === "PENDING_VERIFICATION" ? "warn" : s === "SUSPENDED" ? "danger" : "neutral") as Tone;
export const verifTone = (s: string) => (s === "VERIFIED" ? "moss" : s === "REJECTED" ? "danger" : s === "PENDING" ? "warn" : "neutral") as Tone;

export const PRODUCT_STATUS = PRODUCT_STATUS_LABEL as Record<string, string>;
export const PRODUCT_KIND = PRODUCT_KIND_LABEL as Record<string, string>;
export const productTone = (s: string) => (s === "ACTIVE" ? "moss" : s === "SOLD_OUT" ? "warn" : s === "DISABLED" ? "danger" : "neutral") as Tone;
export const kindLabel = (k: string) => PRODUCT_KIND_LABEL[k as ProductKind] ?? k;

export const orderTone = (s: string) => (s === "COMPLETED" ? "moss" : s === "PROBLEM" ? "danger" : s === "CANCELLED" || s === "REFUNDED" ? "neutral" : "warn") as Tone;
export const orderLabel = (s: string) => (ORDER_STATUS_LABEL as Record<string, string>)[s] ?? s;
export const paymentLabel = (s: string) => (PAYMENT_STATUS_LABEL as Record<string, string>)[s] ?? s;

export const money = (minor: number, currency: string) => formatMoney(minor, (currency === "EUR" ? "EUR" : "CHF") as Currency);

/** Verfügbarer Bestand (ohne Reservierungen); null = kein Bestand geführt (digital). */
export function stockOf(inv: { onHand: number; reserved: number }[]) {
  if (!inv.length) return null;
  return inv.reduce((s, i) => s + Math.max(0, i.onHand - i.reserved), 0);
}

/** Name → Admin-Detail, kleines Icon → öffentliche Seite. */
export function NameLink({ href, publicHref, children, className }: { href: string; publicHref?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Link href={href} className="font-semibold hover:underline">
        {children}
      </Link>
      {publicHref && (
        <Link href={publicHref} target="_blank" className="text-muted hover:text-ink" aria-label="Öffentliche Seite öffnen" title="Öffentliche Seite öffnen">
          <ExternalLink size={12} aria-hidden />
        </Link>
      )}
    </span>
  );
}

export const manageLink = "inline-flex h-9 items-center rounded-xl border border-line-strong bg-card px-3.5 text-[13px] font-semibold text-ink hover:border-rule-strong";

export function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-10 shrink-0 rounded-xl border border-line object-cover" />
  ) : (
    <span aria-hidden className="size-10 shrink-0 rounded-xl border border-line bg-sunken" />
  );
}

export function StatGrid({ items }: { items: { label: string; value: React.ReactNode; note?: React.ReactNode; restricted?: boolean; alert?: boolean }[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="border-l border-line pl-4">
          <dt className="spec flex items-center gap-2">
            {s.label}
            {s.restricted && <span className="text-clay-ink">Admin</span>}
          </dt>
          <dd className={cn("mt-1 text-xl font-semibold num", s.alert && "text-clay-ink")}>{s.value}</dd>
          {s.note && <dd className="mt-0.5 text-xs text-muted">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

type CaseRow = {
  id: string;
  number: number;
  targetType: string;
  targetId: string;
  primaryReason: string;
  status: string;
  riskScore: number;
  reportCount: number;
  createdAt: Date;
  actions: { action: string }[];
};

export function CasesTable({ cases, contentLabel }: { cases: CaseRow[]; contentLabel?: (c: CaseRow) => React.ReactNode }) {
  return (
    <Table className="mt-3" caption="Moderationsfälle">
      <thead>
        <tr>
          <Th>Fall</Th>
          <Th>Risiko</Th>
          <Th>Grund</Th>
          <Th>Inhalt</Th>
          <Th align="right">Meldungen</Th>
          <Th>Massnahme</Th>
          <Th>Status</Th>
          <Th>Datum</Th>
        </tr>
      </thead>
      <tbody>
        {cases.length === 0 && <EmptyRow cols={8}>Keine Meldungen oder Fälle.</EmptyRow>}
        {cases.map((h) => (
          <Tr key={h.id} highlight={h.status === "OPEN" || h.status === "IN_REVIEW"}>
            <Td mono>
              <Link className="font-semibold hover:underline" href={`/admin/moderation/${h.id}`}>
                Nº {h.number}
              </Link>
            </Td>
            <Td><RiskMeter score={h.riskScore} /></Td>
            <Td>{reasonLabel(h.primaryReason)}</Td>
            <Td className="max-w-[220px] truncate">{contentLabel ? contentLabel(h) : TARGET_TYPE_LABEL[h.targetType]}</Td>
            <Td align="right">{h.reportCount}</Td>
            <Td>{h.actions[0] ? MODERATION_ACTION_LABEL[h.actions[0].action as ModerationActionKind] : "–"}</Td>
            <Td><Badge>{CASE_STATUS_LABEL[h.status]}</Badge></Td>
            <Td className="whitespace-nowrap text-muted">{shortDate(h.createdAt)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

type ReviewRow = {
  id: string;
  productRating: number;
  sellerRating: number | null;
  body: string;
  sellerReply: string | null;
  state: string;
  createdAt: Date;
  product: { id: string; title: string };
  author: { id: string; profile: { handle: string } | null };
};

const REVIEW_STATE: Record<string, string> = { PUBLISHED: "Sichtbar", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt", DRAFT: "Entwurf" };

function Stars({ n }: { n: number }) {
  return (
    <span className="font-mono text-[12px] text-ink-2" aria-label={`${n} von 5`}>
      {"★".repeat(n)}
      <span className="text-line-strong">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

export function ReviewsTable({ reviews, showProduct }: { reviews: ReviewRow[]; showProduct?: boolean }) {
  return (
    <Table className="mt-3" caption="Bewertungen">
      <thead>
        <tr>
          <Th>Bewertung</Th>
          {showProduct && <Th>Produkt</Th>}
          <Th>Von</Th>
          <Th>Status</Th>
          <Th>Datum</Th>
          <Th align="right">Aktion</Th>
        </tr>
      </thead>
      <tbody>
        {reviews.length === 0 && <EmptyRow cols={showProduct ? 6 : 5}>Noch keine Bewertungen.</EmptyRow>}
        {reviews.map((r) => (
          <Tr key={r.id}>
            <Td className="max-w-[360px]">
              <Stars n={r.productRating} />
              {r.sellerRating != null && <span className="ml-2 text-xs text-muted">Shop {r.sellerRating}/5</span>}
              {r.body && <p className="mt-1 line-clamp-3 text-[13px] text-ink-2">{r.body}</p>}
              {r.sellerReply && <p className="mt-1 line-clamp-2 border-l border-line pl-2 text-xs text-muted">Antwort: {r.sellerReply}</p>}
            </Td>
            {showProduct && (
              <Td className="max-w-[200px]">
                <Link href={`/admin/marktplatz/produkte/${r.product.id}`} className="line-clamp-2 hover:underline">
                  {r.product.title}
                </Link>
              </Td>
            )}
            <Td className="whitespace-nowrap">
              <Link href={`/admin/nutzer/${r.author.id}`} className="hover:underline">
                @{r.author.profile?.handle ?? "–"}
              </Link>
            </Td>
            <Td><Badge tone={r.state === "PUBLISHED" ? "moss" : r.state === "REMOVED" ? "danger" : "neutral"}>{REVIEW_STATE[r.state] ?? r.state}</Badge></Td>
            <Td className="whitespace-nowrap text-muted">{shortDate(r.createdAt)}</Td>
            <Td>
              <div className="flex justify-end">
                {r.state === "PUBLISHED" && (
                  <ReasonButton
                    action={setReviewHiddenAction.bind(null, r.id, true)}
                    label="Ausblenden"
                    variant="ghost"
                    confirmVariant="danger"
                    title="Bewertung ausblenden"
                    description="Die Bewertung ist nicht mehr öffentlich und zählt nicht mehr zum Durchschnitt. Bei gemeldeten Bewertungen bitte den Moderationsfall nutzen."
                    withPublicNote
                    confirmLabel="Ausblenden"
                  />
                )}
                {r.state === "HIDDEN" && (
                  <ReasonButton action={setReviewHiddenAction.bind(null, r.id, false)} label="Wieder anzeigen" variant="outline" title="Bewertung wieder anzeigen" confirmLabel="Anzeigen" />
                )}
              </div>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

type AuditRow = { seq: number; action: string; targetType: string | null; meta: unknown; createdAt: Date; label: string | null; actor: { profile: { handle: string } | null } | null };

export function AuditList({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Keine Einträge.</p>;
  return (
    <ol className="mt-3 divide-y divide-line text-[13px]">
      {rows.map((a) => {
        const m = (a.meta ?? {}) as Record<string, unknown>;
        const note = typeof m.reason === "string" ? m.reason : typeof m.note === "string" ? m.note : null;
        return (
          <li key={a.seq} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
            <span className="font-mono text-muted">#{a.seq}</span>
            <span className="font-mono">{a.action}</span>
            {a.label && <span className="max-w-[220px] truncate text-ink-2">{a.label}</span>}
            <span className="text-muted">{a.actor?.profile ? `@${a.actor.profile.handle}` : "System"}</span>
            <span className="ml-auto text-muted">{dateTime(a.createdAt)}</span>
            {note && <span className="basis-full text-xs text-muted">„{note}“</span>}
          </li>
        );
      })}
    </ol>
  );
}
