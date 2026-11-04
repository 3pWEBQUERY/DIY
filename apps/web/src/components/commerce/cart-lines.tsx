"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { PRODUCT_KIND_LABEL, formatMoney, type Currency, type ProductKind } from "@werkraum/shared";
import { Cover, type Variants } from "@/components/ui/media";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { removeCartItemAction, updateCartItemAction } from "@/app/(app)/markt/actions";

export type CartLine = {
  id: string;
  productId: string;
  title: string;
  variantName: string | null;
  href: string;
  kind: string;
  category: string;
  cover: { url: string | null; variants: Variants | null; alt: string };
  unitMinor: number;
  quantity: number;
  lineMinor: number;
  isDigital: boolean;
  available: number | null;
  problem: string | null;
};

function Line({ line, currency }: { line: CartLine; currency: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const max = line.isDigital ? 1 : Math.max(1, Math.min(99, line.available ?? 1));

  function setQty(q: number) {
    start(async () => {
      const r = await updateCartItemAction(line.id, q);
      if (!r.ok) toast(r.error, "error");
      else if (r.data.capped) toast(`Nur noch ${r.data.quantity} verfügbar.`);
      router.refresh();
    });
  }

  return (
    <li className={cn("grid grid-cols-[72px_1fr] gap-4 py-4 sm:grid-cols-[88px_1fr_auto]", pending && "opacity-60")}>
      <Link href={line.href} className="block border border-line rounded-2xl" tabIndex={-1} aria-hidden>
        <Cover url={line.cover.url} variants={line.cover.variants} alt="" seed={line.productId} category={line.category} ratio="4/5" sizes="88px" />
      </Link>
      <div className="min-w-0">
        <p className="spec">{PRODUCT_KIND_LABEL[line.kind as ProductKind]}</p>
        <Link href={line.href} className="headline mt-0.5 block text-[17px] leading-snug hover:underline">
          {line.title}
        </Link>
        {line.variantName && <p className="mt-0.5 text-[13px] text-muted">Variante: {line.variantName}</p>}
        <p className="num mt-1 text-[13px] text-muted">{formatMoney(line.unitMinor, currency)} pro Stück</p>
        {line.problem && (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">
            {line.problem}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 sm:hidden">
          <Qty line={line} max={max} disabled={pending} onChange={setQty} />
          <Remove id={line.id} title={line.title} />
        </div>
      </div>
      <div className="hidden flex-col items-end justify-between sm:flex">
        <p className="num text-[15px] font-semibold">{formatMoney(line.lineMinor, currency)}</p>
        <div className="flex items-center gap-3">
          <Qty line={line} max={max} disabled={pending} onChange={setQty} />
          <Remove id={line.id} title={line.title} />
        </div>
      </div>
    </li>
  );
}

function Qty({ line, max, disabled, onChange }: { line: CartLine; max: number; disabled: boolean; onChange: (q: number) => void }) {
  if (line.isDigital) return <span className="spec">1 Lizenz</span>;
  return (
    <div className="flex h-9 items-center border border-line-strong bg-card rounded-xl" role="group" aria-label={`Menge für ${line.title}`}>
      <button type="button" className="grid size-9 place-items-center hover:bg-sunken disabled:opacity-40 rounded-xl" aria-label="Weniger" disabled={disabled || line.quantity <= 1} onClick={() => onChange(line.quantity - 1)}>
        <Minus size={13} />
      </button>
      <span className="num w-7 text-center text-[14px] font-semibold">{line.quantity}</span>
      <button type="button" className="grid size-9 place-items-center hover:bg-sunken disabled:opacity-40 rounded-xl" aria-label="Mehr" disabled={disabled || line.quantity >= max} onClick={() => onChange(line.quantity + 1)}>
        <Plus size={13} />
      </button>
    </div>
  );
}

function Remove({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`${title} entfernen`}
      className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-danger"
      onClick={() =>
        start(async () => {
          const r = await removeCartItemAction(id);
          if (!r.ok) toast(r.error, "error");
          router.refresh();
        })
      }
    >
      <X size={14} /> Entfernen
    </button>
  );
}

export function CartLines({ lines, currency = "CHF" }: { lines: CartLine[]; currency?: Currency }) {
  return (
    <ul className="divide-y divide-line">
      {lines.map((l) => (
        <Line key={l.id} line={l} currency={currency} />
      ))}
    </ul>
  );
}
