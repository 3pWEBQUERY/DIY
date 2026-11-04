import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { Wordmark } from "@/components/shell/wordmark";
import { StudioNav, StudioMobileNav } from "@/components/studio/studio-nav";
import { Avatar } from "@/components/ui/misc";
import { PageTransition } from "@/components/shell/page-transition";

export const metadata = { title: { default: "Creator Studio", template: "%s · Creator Studio" }, robots: { index: false } };

/** Creator Studio – separater Verwaltungsbereich im selben Konto (§6.3). */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio");
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-rule bg-paper px-4 sm:px-6">
        <Link href="/feed" className="flex items-center gap-2 text-sm text-muted hover:text-ink" aria-label="Zurück zur Community">
          <ArrowLeft size={16} />
          <Wordmark compact />
        </Link>
        <span className="h-5 w-px bg-line" />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em]">Creator Studio</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user.profile.displayName}</span>
          <Avatar src={user.profile.avatarUrl} name={user.profile.displayName} size={30} />
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px]">
        <StudioNav hasShop={!!user.shop} />
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12">
          <StudioMobileNav />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
