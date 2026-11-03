"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, pad } from "@/lib/utils";

export type AdminNavItem = { href: string; label: string; admin?: boolean; badge?: number; exact?: boolean };
export type AdminNavGroup = { title: string; items: AdminNavItem[] };

/** Navigation des Admin-Bereichs. Punkte ohne Berechtigung werden serverseitig herausgefiltert. */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  let n = 0;
  return (
    <nav aria-label="Administration" className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 overflow-y-auto border-r border-line bg-paper py-5 lg:block">
      {groups.map((g) => (
        <div key={g.title} className="mb-5 px-3">
          <p className="spec mb-1.5 px-3">{g.title}</p>
          <ul>
            {g.items.map((item) => {
              n++;
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-8 items-center gap-3 px-3 text-[13.5px] text-ink-2 hover:bg-sunken", active && "bg-ink text-paper hover:bg-ink")}
                  >
                    <span className={cn("font-mono text-[10px]", active ? "text-paper/60" : "text-muted/70")}>{pad(n)}</span>
                    <span className="truncate">{item.label}</span>
                    {!!item.badge && (
                      <span className={cn("ml-auto font-mono text-[11px] num", active ? "text-paper" : "text-clay-ink")} aria-label={`${item.badge} offen`}>
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminMobileNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const items = groups.flatMap((g) => g.items);
  return (
    <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 scrollbar-none sm:-mx-6 sm:px-6 lg:hidden">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("shrink-0 px-3 py-1.5 text-sm", active ? "bg-ink text-paper" : "text-muted")}>
            {item.label}
            {!!item.badge && <span className="ml-1.5 font-mono text-[11px]">{item.badge}</span>}
          </Link>
        );
      })}
    </div>
  );
}
