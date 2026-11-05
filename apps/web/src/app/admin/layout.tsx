import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { hasRole } from "@/server/authz";
import { adminPage, ROLE_LABEL } from "@/server/admin/guard";
import { adminNavCounts } from "@/server/admin/kpis";
import { Signet } from "@/components/shell/wordmark";
import { AdminNav, AdminMobileNav, type AdminNavGroup } from "@/components/admin/admin-nav";
import { PageTransition } from "@/components/shell/page-transition";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Administration" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Administration & Moderation (PRD §6.4, §7, §24). Eigener Rahmen, getrennt von der Community.
 * Moderation sieht keine Zahlungs- und Systembereiche (§24.3).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await adminPage("PLATFORM_MODERATOR");
  const isAdmin = hasRole(user, "ADMIN");
  const c = await adminNavCounts();

  const groups: AdminNavGroup[] = [
    { title: "Übersicht", items: [{ href: "/admin", label: "Dashboard", exact: true }] },
    {
      title: "Vertrauen & Sicherheit",
      items: [
        { href: "/admin/moderation", label: "Moderation", badge: c.cases },
        { href: "/admin/meldungen", label: "Meldungen" },
        { href: "/admin/einsprueche", label: "Einsprüche", badge: c.appeals },
      ],
    },
    {
      title: "Mitglieder & Inhalte",
      items: [
        { href: "/admin/nutzer", label: "Nutzer" },
        { href: "/admin/inhalte", label: "Inhalte" },
        { href: "/admin/communities", label: "Communities" },
      ],
    },
    {
      title: "Marktplatz",
      items: [
        { href: "/admin/marktplatz", label: "Marktplatz & Verkäufer", badge: c.shops },
        ...(isAdmin ? [{ href: "/admin/transaktionen", label: "Transaktionen & Streitfälle", badge: c.disputes }] : []),
      ],
    },
    {
      title: "Redaktion & Daten",
      items: [
        { href: "/admin/kategorien", label: "Kategorien & Materialien" },
        { href: "/admin/redaktion", label: "Redaktion" },
      ],
    },
    {
      title: "Betrieb",
      items: [
        { href: "/admin/support", label: "Support", badge: c.tickets },
        ...(isAdmin
          ? [
              { href: "/admin/system", label: "Systemkonfiguration" },
              { href: "/admin/audit", label: "Audit-Protokoll" },
            ]
          : []),
      ],
    },
  ];

  return (
    <div className="min-h-dvh bg-paper">
      <div className="sticky top-0 z-30 bg-paper/90 px-3 pb-2 pt-3 backdrop-blur-md sm:px-4 sm:pt-4">
      <header className="flex h-12 items-center gap-4 rounded-2xl bg-ink px-4 text-paper sm:px-5">
        <Link href="/admin" className="flex items-center gap-2.5" aria-label="Administration – Übersicht">
          <Signet size={24} />
          <span className="font-serif text-[18px] leading-none tracking-[-0.02em]">Werkraum</span>
        </Link>
        <span className="h-5 w-px bg-paper/25" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/80">Administration</span>
        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="text-paper/70">{user.profile.displayName}</span>
            <span className="rounded-full border border-paper/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]">{ROLE_LABEL[user.role]}</span>
          </span>
          <Link href="/feed" className="flex items-center gap-1.5 text-paper/80 hover:text-paper">
            <ArrowLeft size={14} aria-hidden />
            Zur Community
          </Link>
        </div>
      </header>
      </div>
      <div className="mx-auto flex max-w-[1480px]">
        <AdminNav groups={groups} />
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <AdminMobileNav groups={groups} />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
