import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, formatMoney, type Currency, type OrderStatus, COUNTRY_LABEL } from "@werkraum/shared";
import { Badge } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";

const cur = (c: string) => (c === "EUR" ? "EUR" : "CHF") as Currency;

const ORDER_TONE: Record<OrderStatus, "neutral" | "moss" | "clay" | "ink" | "warn" | "danger" | "outline"> = {
  PENDING_PAYMENT: "warn",
  NEW: "clay",
  IN_PROGRESS: "outline",
  READY_TO_SHIP: "outline",
  SHIPPED: "moss",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  PROBLEM: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

const PAY_TONE: Record<string, "neutral" | "moss" | "warn" | "danger" | "outline"> = {
  REQUIRES_PAYMENT: "warn",
  PROCESSING: "warn",
  SUCCEEDED: "moss",
  FAILED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "outline",
  DISPUTED: "danger",
};

/** Zahlungsstatus – bewusst getrennt vom Bestellstatus dargestellt (§13.6). */
export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge tone={PAY_TONE[status] ?? "neutral"}>{PAYMENT_STATUS_LABEL[status as keyof typeof PAYMENT_STATUS_LABEL] ?? status}</Badge>;
}

/**
 * Kostenaufstellung (§5.7): Warenwert, Versand, Gesamt – für Käufer:innen ohne versteckte Posten.
 * Für Verkäufer:innen zusätzlich Plattformgebühr und Auszahlungsbetrag.
 */
export function FeeSummary({
  subtotal,
  shipping,
  total,
  currency = "CHF",
  seller,
  refunded,
  className,
}: {
  subtotal: number;
  shipping: number;
  total: number;
  currency?: string;
  seller?: { platformFee: number; feeLabel: string };
  refunded?: number;
  className?: string;
}) {
  const c = cur(currency);
  const Row = ({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) => (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong && "border-t border-rule pt-2.5 mt-1", muted && "text-muted")}>
      <dt className={cn("text-[14px]", strong && "font-semibold")}>{label}</dt>
      <dd className={cn("num text-[14px]", strong ? "text-[17px] font-semibold" : "")}>{value}</dd>
    </div>
  );
  return (
    <dl className={cn("text-ink", className)}>
      <Row label="Warenwert" value={formatMoney(subtotal, c)} />
      <Row label="Versand" value={shipping ? formatMoney(shipping, c) : "kostenlos"} />
      <Row label="Gesamt" value={formatMoney(total, c)} strong />
      {!!refunded && <Row label="Davon erstattet" value={`− ${formatMoney(refunded, c)}`} muted />}
      {seller && (
        <>
          <Row label={`Plattformgebühr (${seller.feeLabel} auf den Warenwert)`} value={`− ${formatMoney(seller.platformFee, c)}`} muted />
          <Row label="Auszahlung an dich (vor Stripe-Gebühren)" value={formatMoney(total - seller.platformFee - (refunded ?? 0), c)} strong />
        </>
      )}
    </dl>
  );
}

export type TimelineEvent = { id: string; from: OrderStatus | null; to: OrderStatus; note: string; createdAt: Date | string; actor?: string | null };

/** Statusverlauf als Projektfaden: Knoten auf einer durchgehenden Linie. */
export function OrderTimeline({ events, className }: { events: TimelineEvent[]; className?: string }) {
  return (
    <ol className={cn("relative ml-1.5 border-l border-rule", className)}>
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const changed = e.from !== e.to;
        return (
          <li key={e.id} className="relative pb-6 pl-6 last:pb-0">
            <span aria-hidden className={cn("absolute -left-[5px] top-1.5 size-[9px] border border-rule rounded-full", last ? "bg-ink" : changed ? "bg-paper" : "bg-line-strong border-line-strong")} />
            <p className="spec">
              {formatDate(e.createdAt, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
              {new Date(e.createdAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })}
            </p>
            <p className={cn("mt-0.5 text-[14px]", last && "font-semibold")}>{changed ? ORDER_STATUS_LABEL[e.to] : "Vermerk"}</p>
            {e.note && <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2">{e.note}</p>}
            {e.actor && <p className="mt-0.5 text-[12px] text-muted">{e.actor}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Lieferadresse (aus dem Json-Feld der Bestellung). */
export function AddressBlock({ address, className }: { address: unknown; className?: string }) {
  const a = (address ?? {}) as Record<string, string>;
  const country = a.country ? (COUNTRY_LABEL[a.country as keyof typeof COUNTRY_LABEL] ?? a.country) : "";
  const lines = [a.name, a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(" "), country].filter(Boolean);
  return (
    <address className={cn("not-italic text-[14px] leading-relaxed", className)}>
      {lines.map((l, i) => (
        <span key={i} className="block">
          {l}
        </span>
      ))}
    </address>
  );
}
