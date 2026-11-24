import { db } from "@/server/db";
import { appUrl } from "@/server/commerce/stripe";
import { clearPdfBrand, getPdfBrand, savePdfBrand } from "@/server/pro/pdf-brand";
import { isPro } from "@/server/pro/service";
import { DELETE, GET, PUT, me, type RouteDef } from "../router";

/**
 * PDF-Branding der eigenen Anleitungen (Creator Pro) in der App – gleiche Dienste und Vorgaben
 * wie /studio/einstellungen: Logo, Name und https-Link statt des Werkuno-Kopfs in der Druckfassung.
 */
export const pdfBrandRoutes: RouteDef[] = [
  /** Gespeichertes Branding samt Vorschlägen (Profilname, Shop- bzw. Profil-Link) und Vorschau-Anleitung */
  GET("/studio/pdf-brand", async () => {
    const u = await me();
    const [pro, brand, latest] = await Promise.all([
      isPro(u.id),
      getPdfBrand(u.id),
      db.tutorial.findFirst({ where: { authorId: u.id, state: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true } }),
    ]);
    const shopLink = u.shop?.slug ? appUrl(`/markt/${u.shop.slug}`) : appUrl(`/u/${u.profile.handle}`);
    return {
      isPro: pro,
      brand,
      defaults: { name: u.profile.displayName, link: shopLink.startsWith("https://") ? shopLink : "" },
      preview: latest ? { slug: latest.slug, title: latest.title, href: `/anleitungen/${latest.slug}/drucken` } : null,
    };
  }),
  /** Speichern (nur mit aktivem Pro); `logoMediaId` aus dem normalen Medien-Upload, `removeLogo` entfernt es */
  PUT("/studio/pdf-brand", async (c) => ({ brand: await savePdfBrand(await me(), await c.json()) })),
  /** Zurück zur Standard-Druckfassung */
  DELETE("/studio/pdf-brand", async () => clearPdfBrand(await me())),
];
