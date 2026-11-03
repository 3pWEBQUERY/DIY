"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings, LayoutDashboard, ShieldCheck, Bookmark, ShoppingBag, LogIn, Package } from "lucide-react";
import { cn, pad } from "@/lib/utils";
import { MAIN_NAV, MOBILE_NAV } from "./nav-config";
import { Wordmark } from "./wordmark";
import { Avatar, Kbd } from "@/components/ui/misc";
import { openCommandPalette } from "./command-palette";

export type ShellUser = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isStaff: boolean;
  hasShop: boolean;
} | null;

function isActive(pathname: string, href: string, match?: string[]) {
  if (pathname === href) return true;
  return (match ?? [href]).some((m) => pathname.startsWith(m));
}

export function SideNav({ user, counts }: { user: ShellUser; counts: { messages: number; notifications: number; cart: number } }) {
  const pathname = usePathname();
  const items = MAIN_NAV.filter((i) => !i.auth || user);
  return (
    <nav
      aria-label="Hauptnavigation"
      className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-r border-line bg-paper md:flex xl:w-[252px]"
    >
      <div className="flex h-16 items-center px-5 xl:px-6">
        <Link href={user ? "/feed" : "/"} aria-label="Werkraum – Startseite" className="xl:hidden">
          <Wordmark compact />
        </Link>
        <Link href={user ? "/feed" : "/"} aria-label="Werkraum – Startseite" className="hidden xl:block">
          <Wordmark />
        </Link>
      </div>

      <button
        onClick={openCommandPalette}
        className="mx-3 mb-3 flex h-10 items-center gap-2.5 border border-line bg-card px-3 text-sm text-muted transition-colors hover:border-ink hover:text-ink xl:mx-4"
        aria-label="Suchen (Befehlspalette öffnen)"
      >
        <Search size={16} className="shrink-0" />
        <span className="hidden flex-1 text-left xl:inline">Suchen …</span>
        <span className="hidden xl:inline-flex gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <ul className="flex flex-1 flex-col gap-px overflow-y-auto px-3 scrollbar-none xl:px-4">
        {items.map((item, i) => {
          const active = isActive(pathname, item.href, item.match);
          const count = item.badge ? counts[item.badge] : 0;
          const Icon = item.icon;
          if (item.href === "/erstellen") {
            return (
              <li key={item.href} className="my-2">
                <Link
                  href={item.href}
                  className={cn(
                    "group flex h-11 items-center justify-center gap-3 rounded-sm bg-moss px-3 text-paper transition-colors hover:bg-moss-ink xl:justify-start",
                    active && "bg-moss-ink",
                  )}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span className="hidden text-sm font-semibold xl:inline">Erstellen</span>
                  <span className="ml-auto hidden font-mono text-[10px] opacity-60 xl:inline">{pad(i + 1)}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center justify-center gap-3 px-3 text-[14px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink xl:justify-start",
                  active && "font-semibold text-ink",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[2px] bg-clay" aria-hidden />}
                <span className="relative">
                  <Icon size={18} strokeWidth={active ? 2.1 : 1.6} />
                  {count > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 font-mono text-[9px] font-semibold text-paper xl:hidden">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                <span className="hidden xl:inline">{item.label}</span>
                <span className="ml-auto hidden items-center gap-2 xl:flex">
                  {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-clay px-1.5 font-mono text-[10px] font-semibold text-paper">{count > 99 ? "99+" : count}</span>}
                  <span className="font-mono text-[10px] text-muted/70">{pad(i + 1)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-3 py-3 xl:px-4">
        {user ? (
          <>
            <div className="mb-2 hidden grid-cols-2 gap-px xl:grid">
              <MiniLink href="/gespeichert" icon={<Bookmark size={14} />} label="Gespeichert" />
              <MiniLink href="/bestellungen" icon={<Package size={14} />} label="Bestellungen" />
              <MiniLink href="/warenkorb" icon={<ShoppingBag size={14} />} label={counts.cart ? `Korb · ${counts.cart}` : "Warenkorb"} />
              <MiniLink href="/studio" icon={<LayoutDashboard size={14} />} label="Studio" />
              {user.isStaff && <MiniLink href="/admin" icon={<ShieldCheck size={14} />} label="Admin" />}
              <MiniLink href="/einstellungen" icon={<Settings size={14} />} label="Einstellungen" />
            </div>
            <Link href={`/u/${user.handle}`} className="flex items-center gap-3 p-1.5 hover:bg-sunken">
              <Avatar src={user.avatarUrl} name={user.displayName} size={34} />
              <span className="hidden min-w-0 xl:block">
                <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                <span className="block truncate text-xs text-muted">@{user.handle}</span>
              </span>
            </Link>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Link href="/anmelden" className="flex h-10 items-center justify-center gap-2 border border-ink text-sm font-semibold hover:bg-ink hover:text-paper">
              <LogIn size={16} />
              <span className="hidden xl:inline">Anmelden</span>
            </Link>
            <Link href="/registrieren" className="hidden h-10 items-center justify-center bg-moss text-sm font-semibold text-paper hover:bg-moss-ink xl:flex">
              Konto erstellen
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

function MiniLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      className={cn("flex h-8 items-center gap-2 px-2 text-[12px] text-muted hover:bg-sunken hover:text-ink", pathname.startsWith(href) && "text-ink font-semibold")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** iPhone/Mobil: native Bottom Navigation mit Safe Area (§28.5). */
export function BottomNav({ user, counts }: { user: ShellUser; counts: { messages: number; notifications: number } }) {
  const pathname = usePathname();
  const items = MAIN_NAV.filter((i) => MOBILE_NAV.includes(i.href));
  return (
    <nav aria-label="Navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper safe-bottom md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const href = !user && item.auth ? "/anmelden" : item.href;
          const active = isActive(pathname, item.href, item.match);
          const Icon = item.icon;
          const isCreate = item.href === "/erstellen";
          return (
            <li key={item.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10px] text-muted", active && "text-ink font-semibold")}
              >
                {isCreate ? (
                  <span className="grid size-9 place-items-center rounded-sm bg-moss text-paper">
                    <Icon size={18} />
                  </span>
                ) : (
                  <>
                    <span className="relative">
                      <Icon size={21} strokeWidth={active ? 2.1 : 1.6} />
                      {item.href === "/profil" && counts.notifications > 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-clay" />}
                    </span>
                    {item.label === "Startseite" ? "Start" : item.label === "Marktplatz" ? "Markt" : item.label}
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
