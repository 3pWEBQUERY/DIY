"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, pad } from "@/lib/utils";

/** Navigationspunkte gemäss PRD §6.3. */
export const STUDIO_NAV = [
  { href: "/studio", label: "Übersicht", exact: true },
  { href: "/studio/inhalte", label: "Meine Inhalte" },
  { href: "/studio/projekte", label: "Meine Projekte" },
  { href: "/studio/anleitungen", label: "Anleitungen" },
  { href: "/studio/blog", label: "Blog" },
  { href: "/studio/produkte", label: "Produkte", shop: true },
  { href: "/studio/bestellungen", label: "Bestellungen", shop: true },
  { href: "/studio/shop", label: "Shopverwaltung" },
  { href: "/studio/medien", label: "Medienbibliothek" },
  { href: "/studio/statistiken", label: "Statistiken" },
  { href: "/studio/einnahmen", label: "Einnahmen & Auszahlungen", shop: true },
  { href: "/studio/einstellungen", label: "Einstellungen" },
];

export function StudioNav({ hasShop }: { hasShop: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Studio" className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-line py-6 md:block">
      <ul className="px-3">
        {STUDIO_NAV.map((item, i) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const disabled = item.shop && !hasShop;
          return (
            <li key={item.href}>
              <Link
                href={disabled ? "/studio/shop" : item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 px-3 text-[14px] text-ink-2 hover:bg-sunken rounded-xl",
                  active && "bg-ink text-paper hover:bg-ink",
                  disabled && "text-muted/70",
                )}
              >
                <span className={cn("font-mono text-[10px]", active ? "text-paper/60" : "text-muted/70")}>{pad(i + 1)}</span>
                <span className="truncate">{item.label}</span>
                {disabled && <span className="ml-auto spec">Shop</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile Studio-Navigation als horizontale Leiste. */
export function StudioMobileNav() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 scrollbar-none md:hidden">
      {STUDIO_NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={cn("shrink-0 px-3 py-1.5 text-sm", active ? "bg-ink text-paper" : "text-muted")}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
