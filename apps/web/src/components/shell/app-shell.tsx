import Link from "next/link";
import { Bell } from "lucide-react";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { hasRole } from "@/server/authz";
import { SideNav, BottomNav, MobileMoreMenu, type ShellUser } from "./side-nav";
import { CommandPalette } from "./command-palette";
import { Wordmark } from "./wordmark";
import { MobileSearchButton } from "./mobile-search";

async function counts(userId: string) {
  const [notifications, messages, cart] = await Promise.all([
    db.notification.count({ where: { recipientId: userId, readAt: null } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "ConversationMember" cm
      JOIN "Conversation" c ON c.id = cm."conversationId"
      WHERE cm."userId" = ${userId} AND cm."archivedAt" IS NULL AND cm."isRequest" = false
        AND (cm."lastReadAt" IS NULL OR cm."lastReadAt" < c."lastMessageAt")
        AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m."senderId" <> ${userId})`.then((r) => Number(r[0]?.n ?? 0)),
    db.cartItem.aggregate({ where: { cart: { userId } }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0),
  ]);
  return { notifications, messages, cart };
}

/** Hauptlayout: linke Navigation, zentraler Inhalt, optionale rechte Kontextspalte (§28.5). */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const shellUser: ShellUser = user?.profile
    ? {
        handle: user.profile.handle,
        displayName: user.profile.displayName,
        avatarUrl: user.profile.avatarUrl,
        isStaff: hasRole(user, "PLATFORM_MODERATOR"),
        hasShop: !!user.shop,
      }
    : null;
  const c = user ? await counts(user.id) : { notifications: 0, messages: 0, cart: 0 };
  // Nutzereinstellung „Bewegung reduzieren“ (§29.4) zusätzlich zu prefers-reduced-motion
  const reduceMotion = user ? ((await db.userPreference.findUnique({ where: { userId: user.id }, select: { reduceMotion: true } }))?.reduceMotion ?? false) : false;

  return (
    <div className="flex min-h-dvh" data-reduce-motion={reduceMotion ? "" : undefined}>
      <SideNav user={shellUser} counts={c} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Kopfzeile */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper px-4 md:hidden">
          <Link href={user ? "/feed" : "/"} aria-label="Startseite">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <MobileSearchButton />
            {shellUser && <MobileMoreMenu user={shellUser} cart={c.cart} />}
            {user ? (
              <Link href="/benachrichtigungen" className="relative grid size-10 place-items-center" aria-label={`Benachrichtigungen${c.notifications ? `, ${c.notifications} ungelesen` : ""}`}>
                <Bell size={20} strokeWidth={1.6} />
                {c.notifications > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-clay" />}
              </Link>
            ) : (
              <Link href="/anmelden" className="px-3 py-2 text-sm font-semibold">
                Anmelden
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav user={shellUser} counts={c} />
      <CommandPalette />
    </div>
  );
}

