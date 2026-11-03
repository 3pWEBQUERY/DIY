"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, pad } from "@/lib/utils";

export const SETTINGS_NAV = [
  { href: "/einstellungen/profil", label: "Profil" },
  { href: "/einstellungen/konto", label: "Konto & Daten" },
  { href: "/einstellungen/sicherheit", label: "Sicherheit" },
  { href: "/einstellungen/benachrichtigungen", label: "Benachrichtigungen" },
  { href: "/einstellungen/feed", label: "Feed & Interessen" },
  { href: "/einstellungen/privatsphaere", label: "Privatsphäre" },
  { href: "/einstellungen/hilfe-support", label: "Hilfe & Support" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Einstellungen" className="sticky top-10 hidden h-fit w-52 shrink-0 md:block">
        <ul className="border-l border-line">
          {SETTINGS_NAV.map((item, i) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("-ml-px flex h-9 items-center gap-3 border-l-2 border-transparent pl-4 text-[14px] text-muted hover:text-ink", active && "border-ink font-semibold text-ink")}
                >
                  <span className="font-mono text-[10px] text-muted/70">{pad(i + 1)}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 scrollbar-none md:hidden">
        {SETTINGS_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("shrink-0 px-3 py-1.5 text-sm", active ? "bg-ink text-paper" : "text-muted")}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
