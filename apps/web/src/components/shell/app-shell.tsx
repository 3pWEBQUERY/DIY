import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { hasRoleIgnoringMfa } from "@/server/authz";
import { SideNav, BottomNav, MobileMoreMenu, type ShellUser } from "./side-nav";
import { CommandPalette } from "./command-palette";
import { Wordmark } from "./wordmark";
import { MobileSearchButton } from "./mobile-search";
import { PageTransition } from "./page-transition";
import { LiveCountsProvider } from "./live-counts";
import { NotificationBell } from "./notification-bell";
import { shellCounts } from "@/server/shell/counts";
import { flagsFor } from "@/server/flags";
import { VerifyEmailBanner } from "./verify-email-banner";

/** Hauptlayout: linke Navigation, zentraler Inhalt, optionale rechte Kontextspalte (§28.5). */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const shellUser: ShellUser = user?.profile
    ? {
        handle: user.profile.handle,
        displayName: user.profile.displayName,
        avatarUrl: user.profile.avatarUrl,
        isStaff: hasRoleIgnoringMfa(user, "PLATFORM_MODERATOR"),
        hasShop: !!user.shop,
      }
    : null;
  const c = user ? await shellCounts(user.id) : { notifications: 0, messages: 0, requests: 0, cart: 0 };
  // Nutzereinstellung „Bewegung reduzieren“ (§29.4) zusätzlich zu prefers-reduced-motion
  const reduceMotion = user ? ((await db.userPreference.findUnique({ where: { userId: user.id }, select: { reduceMotion: true } }))?.reduceMotion ?? false) : false;

  const navCollapsed = (await cookies()).get("wr_nav")?.value === "collapsed";
  // Abgeschaltete Bereiche (Feature-Flags) aus der Navigation nehmen
  const flags = await flagsFor(user?.id);
  const hide = flags.marketplace ? [] : ["/markt", "/warenkorb"];

  return (
    <LiveCountsProvider initial={c} enabled={!!user}>
    <div className="flex min-h-dvh" data-reduce-motion={reduceMotion ? "" : undefined}>
      <SideNav user={shellUser} collapsed={navCollapsed} hide={hide} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Kopfzeile */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper px-4 md:hidden print:hidden">
          <Link href={user ? "/feed" : "/"} aria-label="Startseite">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <MobileSearchButton />
            {shellUser && <MobileMoreMenu user={shellUser} hide={hide} />}
            {user ? (
              <NotificationBell />
            ) : (
              <Link href="/anmelden" className="px-3 py-2 text-sm font-semibold">
                Anmelden
              </Link>
            )}
          </div>
        </header>
        {user && !user.emailVerifiedAt && user.status === "ACTIVE" && <VerifyEmailBanner email={user.email} />}
        <main id="main" className="flex-1 pb-20 md:pb-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <BottomNav user={shellUser} hide={hide} />
      <CommandPalette />
    </div>
    </LiveCountsProvider>
  );
}

