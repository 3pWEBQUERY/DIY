"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search, Settings, LayoutDashboard, ShieldCheck, Bookmark, ShoppingBag, LogIn, LogOut, Package, ListChecks, Menu, MessageSquare, ChevronLeft, CalendarDays } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { Dialog } from "@/components/ui/dialog";
import { cn, pad } from "@/lib/utils";
import { MAIN_NAV, MOBILE_NAV } from "./nav-config";
import { Wordmark } from "./wordmark";
import { Avatar } from "@/components/ui/misc";
import { openCommandPalette } from "./command-palette";
import { Tip } from "@/components/ui/tooltip";
import { badgeText, useLiveCounts } from "./live-counts";

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

const NAV_COOKIE = "wr_nav";

/** Inhalt eines Rail-Tooltips: Titel, Zähler, kurze Erklärung, optional Tastenkürzel. */
function TipBody({ label, hint, count, keys }: { label: string; hint?: string; count?: number; keys?: string[] }) {
  return (
    <div className="max-w-[240px]">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[13px] font-semibold">{label}</span>
        {!!count && <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-clay px-1.5 text-[10px] font-semibold">{count > 99 ? "99+" : count}</span>}
        {keys && (
          <span className="ml-auto flex gap-1 pl-2">
            {keys.map((k) => (
              <kbd key={k} className="grid h-[18px] min-w-[18px] place-items-center rounded-md bg-paper/12 px-1 font-sans text-[10.5px] font-semibold text-paper/80">{k}</kbd>
            ))}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-[12px] leading-snug text-paper/65">{hint}</p>}
    </div>
  );
}

/** true, sobald der Viewport breit genug für die ausgeklappte Leiste ist (xl). */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 80rem)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function SideNav({ user, collapsed: initial = false, hide = [] }: { user: ShellUser; collapsed?: boolean; hide?: string[] }) {
  const counts = useLiveCounts();
  const pathname = usePathname();
  const items = MAIN_NAV.filter((i) => (!i.auth || user) && !hide.includes(i.href));
  const [collapsed, setCollapsed] = useState(initial);
  const wide = useWide();
  const rail = collapsed || !wide; // Tooltips nur, wenn keine Beschriftung sichtbar ist

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Tastenkürzel „[“ zum Ein-/Ausklappen (nicht in Eingabefeldern)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!window.matchMedia("(min-width: 80rem)").matches) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [toggle]);

  return (
    <nav
      aria-label="Hauptnavigation"
      data-nav={collapsed ? "closed" : "open"}
      className="group/nav sticky top-0 z-20 hidden h-dvh print:!hidden w-[84px] shrink-0 py-3 pl-3 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:block nav-open:w-[276px]"
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] bg-rail text-ink">
        <div className="flex h-[68px] shrink-0 items-center px-3 nav-open:px-5">
          <Link href={user ? "/feed" : "/"} aria-label="Werkuno – Startseite" className="grid size-12 place-items-center rounded-2xl bg-card nav-open:hidden">
            <Wordmark compact height={26} />
          </Link>
          <Link href={user ? "/feed" : "/"} aria-label="Werkuno – Startseite" className="hidden whitespace-nowrap nav-open:block">
            <Wordmark height={30} />
          </Link>
        </div>

        <Tip disabled={!rail} content={<TipBody label="Suchen" hint="Projekte, Menschen, Material & Befehle" keys={["⌘", "K"]} />} className="mx-3 mb-3">
          <button
            onClick={openCommandPalette}
            className="group flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-xl border border-line bg-paper px-[15px] text-sm text-muted transition-colors hover:border-rule-strong hover:bg-card hover:text-ink nav-open:px-3"
            aria-label="Suchen (Befehlspalette öffnen)"
          >
            <Search size={16} className="shrink-0" />
            <span className="hidden flex-1 text-left nav-open:inline">Suchen …</span>
            <span className="hidden gap-1 nav-open:inline-flex">
              {["⌘", "K"].map((k) => (
                <kbd key={k} className="grid h-5 min-w-5 place-items-center rounded-md bg-sunken px-1 font-sans text-[10.5px] font-semibold text-muted">{k}</kbd>
              ))}
            </span>
          </button>
        </Tip>

        <ul className="flex flex-1 flex-col gap-px overflow-y-auto overflow-x-hidden px-3 scrollbar-none">
          {items.map((item, i) => {
            // „Profil“ nur auf dem eigenen Profil markieren, nicht bei fremden Profilen/Projekten
            const active = item.href === "/profil" && user ? pathname === `/u/${user.handle}` || pathname.startsWith(`/u/${user.handle}/`) || pathname === "/profil" : isActive(pathname, item.href, item.match);
            const count = item.badge ? counts[item.badge] : 0;
            const Icon = item.icon;
            if (item.href === "/erstellen") {
              return (
                <li key={item.href} className="my-2">
                  <Tip disabled={!rail} content={<TipBody label="Erstellen" hint={item.hint} />}>
                    <Link
                      href={item.href}
                      aria-label="Erstellen"
                      className={cn(
                        "group flex h-11 items-center gap-3 whitespace-nowrap rounded-xl bg-moss px-[15px] text-paper transition-colors hover:bg-moss-ink",
                        active && "bg-moss-ink",
                      )}
                    >
                      <Icon size={18} strokeWidth={1.8} className="shrink-0" />
                      <span className="hidden text-sm font-semibold nav-open:inline">Erstellen</span>
                      <span className="ml-auto hidden font-mono text-[10px] opacity-60 nav-open:inline">{pad(i + 1)}</span>
                    </Link>
                  </Tip>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Tip disabled={!rail} content={<TipBody label={item.label} hint={item.hint} count={count} />}>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 whitespace-nowrap rounded-xl px-[15px] text-[14px] text-ink-2 transition-colors hover:bg-paper hover:text-ink",
                      active && "bg-card font-semibold text-ink hover:bg-card",
                    )}
                  >
                    <span className="relative shrink-0">
                      <Icon size={18} strokeWidth={active ? 2.1 : 1.7} className={cn(active && "text-moss")} />
                      {count > 0 && (
                        <span className={cn("absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ring-2 nav-open:hidden", "bg-moss text-paper", active ? "ring-card" : "ring-rail group-hover:ring-paper")}>
                          {count > 9 ? "9+" : count}
                        </span>
                      )}
                    </span>
                    <span className="hidden nav-open:inline">{item.label}</span>
                    <span className="ml-auto hidden items-center gap-2 nav-open:flex">
                      {count > 0 && <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-bold num", "bg-moss text-paper")}>{count > 99 ? "99+" : count}</span>}
                      <span className="font-mono text-[10px] text-muted/70">{pad(i + 1)}</span>
                    </span>
                  </Link>
                </Tip>
              </li>
            );
          })}
        </ul>

        <div className="shrink-0 border-t border-line px-3 py-3">
          {user ? (
            <>
              <div className="mb-2 grid grid-cols-1 gap-px nav-open:grid-cols-2">
                {secondaryLinks(user, counts.cart, hide).map((l) => (
                  <Tip key={l.href} disabled={!rail} content={<TipBody label={l.label} />}>
                    <MiniLink {...l} />
                  </Tip>
                ))}
              </div>
              <div className="flex flex-col items-stretch gap-1 nav-open:flex-row nav-open:items-center">
                <Tip disabled={!rail} content={<TipBody label={user.displayName} hint={`@${user.handle} · Profil ansehen`} />} className="min-w-0 nav-open:flex-1">
                  <Link href={`/u/${user.handle}`} aria-label="Dein Profil" className="group flex items-center gap-3 rounded-2xl p-[7px] transition-colors hover:bg-paper hover:text-ink">
                    <Avatar src={user.avatarUrl} name={user.displayName} size={34} />
                    <span className="hidden min-w-0 nav-open:block">
                      <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                      <span className="block truncate text-xs text-muted">@{user.handle}</span>
                    </span>
                  </Link>
                </Tip>
                <Tip content={<TipBody label="Abmelden" hint="Zurück zur Startseite" />}>
                  <SignOutIcon />
                </Tip>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Tip disabled={!rail} content={<TipBody label="Anmelden" hint="Oder neues Konto erstellen" />}>
                <Link href="/anmelden" aria-label="Anmelden" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong bg-paper text-sm font-semibold text-ink transition-colors hover:border-rule-strong hover:bg-card">
                  <LogIn size={16} />
                  <span className="hidden nav-open:inline">Anmelden</span>
                </Link>
              </Tip>
              <Link href="/registrieren" className="hidden h-10 items-center justify-center whitespace-nowrap rounded-xl bg-moss text-sm font-semibold text-paper transition-colors hover:bg-moss-ink nav-open:flex">
                Konto erstellen
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Griff zum Ein-/Ausklappen – sitzt auf der Kante, nur ab xl sinnvoll */}
      <Tip
        content={<TipBody label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"} keys={["["]} />}
        className="absolute -right-3 top-[34px] z-10 hidden xl:block"
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
          aria-expanded={!collapsed}
          className="grid size-6 place-items-center rounded-full border border-line-strong bg-card text-muted opacity-0 transition-[opacity,color,border-color] duration-200 hover:border-moss hover:text-moss focus-visible:opacity-100 group-hover/nav:opacity-100 data-[c=true]:opacity-100"
          data-c={collapsed}
        >
          <ChevronLeft size={14} strokeWidth={2} className={cn("transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </Tip>
    </nav>
  );
}

/** Sekundäre Bereiche (§6.2 „Weitere Funktionen“) – gleiche Liste für Rail, Tablet und Mobil. */
export function secondaryLinks(user: NonNullable<ShellUser>, cart: number, hide: string[] = []) {
  return [
    { href: "/gespeichert", icon: <Bookmark size={14} />, label: "Gespeichert" },
    { href: "/einkaufslisten", icon: <ListChecks size={14} />, label: "Einkaufslisten" },
    { href: "/events", icon: <CalendarDays size={14} />, label: "Events" },
    { href: "/warenkorb", icon: <ShoppingBag size={14} />, label: cart ? `Korb · ${cart}` : "Warenkorb" },
    { href: "/bestellungen", icon: <Package size={14} />, label: "Bestellungen" },
    { href: "/studio", icon: <LayoutDashboard size={14} />, label: "Studio" },
    ...(user.isStaff ? [{ href: "/admin", icon: <ShieldCheck size={14} />, label: "Admin" }] : []),
    { href: "/einstellungen", icon: <Settings size={14} />, label: "Einstellungen" },
  ].filter((l) => !hide.includes(l.href));
}

/** Abmelden: Sitzung beenden und zur Startseite. */
function SignOutIcon() {
  const [pending, setPending] = useState(false);
  return (
    <form action={signOutAction} onSubmit={() => setPending(true)}>
      <button
        type="submit"
        disabled={pending}
        aria-label="Abmelden"
        className="flex h-9 w-full items-center justify-center rounded-xl text-muted transition-colors hover:bg-paper hover:text-danger disabled:opacity-50 nav-open:size-9"
      >
        <LogOut size={16} strokeWidth={1.8} />
      </button>
    </form>
  );
}

function MiniLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "flex h-8 items-center gap-2 whitespace-nowrap rounded-xl px-[17px] text-[12px] text-muted transition-colors hover:bg-paper hover:text-ink nav-open:gap-1.5 nav-open:px-2",
        pathname.startsWith(href) && "bg-card font-semibold text-ink hover:bg-card",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="hidden truncate nav-open:inline">{label}</span>
    </Link>
  );
}

/** iPhone/Mobil: Menü „Mehr“ in der Kopfzeile mit allen sekundären Bereichen. */
export function MobileMoreMenu({ user, hide = [] }: { user: NonNullable<ShellUser>; hide?: string[] }) {
  const { cart, messages } = useLiveCounts();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center" aria-label="Mehr" aria-haspopup="dialog" aria-expanded={open}>
        <span className="relative">
          <Menu size={20} strokeWidth={1.6} />
          {messages > 0 && <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-clay ring-2 ring-paper" aria-label={`${messages} ungelesene Nachrichten`} />}
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mehr">
        <ul className="-mx-2 divide-y divide-line">
          {[{ href: "/nachrichten", icon: <MessageSquare size={18} />, label: "Nachrichten" }, ...secondaryLinks(user, cart, hide)].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={cn("flex h-12 items-center gap-3 px-2 text-[15px] hover:bg-sunken rounded-xl", pathname.startsWith(l.href) && "font-semibold")}>
                <span className="text-muted [&_svg]:size-[18px]">{l.icon}</span>
                {l.label}
                {l.href === "/nachrichten" && messages > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-clay px-1.5 text-[11px] font-bold text-paper">{badgeText(messages)}</span>
                )}
              </Link>
            </li>
          ))}
          <li>
            <form action={signOutAction}>
              <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] text-danger hover:bg-sunken">
                <LogOut size={18} aria-hidden /> Abmelden
              </button>
            </form>
          </li>
        </ul>
      </Dialog>
    </>
  );
}

/** iPhone/Mobil: native Bottom Navigation mit Safe Area (§28.5). */
export function BottomNav({ user, hide = [] }: { user: ShellUser; hide?: string[] }) {
  const counts = useLiveCounts();
  const pathname = usePathname();
  const items = MAIN_NAV.filter((i) => MOBILE_NAV.includes(i.href) && !hide.includes(i.href));
  return (
    <nav aria-label="Navigation" className="fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-line bg-paper safe-bottom md:hidden">
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
                  <span className="grid size-9 place-items-center rounded-xl bg-moss text-paper">
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
