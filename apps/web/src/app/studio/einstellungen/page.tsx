import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { LinkButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/misc";
import { ProMark } from "@/components/pro/pro-mark";
import { getProStatus } from "@/server/pro/service";
import { BRAND } from "@/config/brand";
import { getPdfBrand } from "@/server/pro/pdf-brand";
import { PdfBrandForm } from "@/components/pro/pdf-brand-form";
import { db } from "@/server/db";
import { appUrl } from "@/server/commerce/stripe";
import { proHref } from "@/lib/pro-features";

export const metadata: Metadata = { title: "Einstellungen" };

/** Studio-Einstellungen – Konto-Verknüpfungen und Creator Pro (PRD §22.3). */
export default async function StudioSettingsPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/einstellungen");
  const [pro, brand, latest] = await Promise.all([
    getProStatus(user.id),
    getPdfBrand(user.id),
    db.tutorial.findFirst({ where: { authorId: user.id, state: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { slug: true } }),
  ]);
  const shopLink = user.shop?.slug ? appUrl(`/markt/${user.shop.slug}`) : appUrl(`/u/${user.profile.handle}`);
  return (
    <div className="max-w-[820px]">
      <header className="mb-10">
        <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />Studio</p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Einstellungen</h1>
      </header>

      <section aria-labelledby="se1" className="mb-12">
        <SectionTitle n="01" title={<span id="se1">Profil & Konto</span>} />
        <p className="mt-3 text-sm leading-relaxed text-muted">Name, Benutzername, Bild, Bio, Links und kreative Schwerpunkte verwaltest du zentral in den Kontoeinstellungen – sie gelten für Community und Studio gleichermassen.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/einstellungen/profil" variant="outline">Profil bearbeiten</LinkButton>
          <LinkButton href="/einstellungen/benachrichtigungen" variant="ghost">Benachrichtigungen</LinkButton>
          <LinkButton href="/studio/shop" variant="ghost">Shopverwaltung</LinkButton>
        </div>
      </section>

      <section aria-labelledby="se2" className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="se2" className="headline text-2xl">Creator Pro</h2>
          <ProMark size="md" label={pro.active ? "Aktiv" : "Pro"} />
        </div>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
          {pro.active
            ? "Dein Abo, Schaufenster-Projekte, Medienkit und die Jahresstatistik verwaltest du an einem Ort."
            : `Newsletter, Shop-Aktionen, Planung, eigenes Profil-Design, Schaufenster, Medienkit, Statistik über 12 Monate, längere Videos und eine tiefere Shop-Provision. Die Grundfunktionen von ${BRAND.name} bleiben kostenlos.`}
        </p>
        <LinkButton href="/studio/pro" className="mt-5">{pro.active ? "Creator Pro verwalten" : "Creator Pro ansehen"}</LinkButton>
      </section>

      <section aria-labelledby="se3" className="mt-12">
        <SectionTitle n="02" title={<span id="se3" className="inline-flex items-center gap-2">PDF-Branding <ProMark /></span>} />
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Die Druck- und PDF-Fassung deiner Anleitungen trägt dein Logo, deinen Namen und deinen Link mit QR-Code statt des {BRAND.name}-Kopfs. Ein kleiner Hinweis „erstellt mit {BRAND.name}“ bleibt.
        </p>
        <div className="mt-5 max-w-xl">
          {pro.active ? (
            <PdfBrandForm brand={brand} defaultName={user.profile.displayName} defaultLink={shopLink.startsWith("https://") ? shopLink : ""} previewHref={latest ? `/anleitungen/${latest.slug}/drucken` : null} />
          ) : (
            <LinkButton href={proHref("pdf-branding")} variant="outline">Mit Creator Pro freischalten</LinkButton>
          )}
        </div>
      </section>
    </div>
  );
}
