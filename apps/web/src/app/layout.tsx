import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { SEO_KEYWORDS } from "@/config/seo";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";
import { Suspense } from "react";
import { NavProgress } from "@/components/shell/page-transition";
import { ErrorReporter } from "@/components/shell/error-reporter";
import { VersionWatcher } from "@/components/shell/version-watcher";
import { categoryRegistrySnapshot } from "@werkraum/shared";
import { CategoryRegistrySync } from "@/components/shell/category-registry";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const appStoreId = process.env.APPLE_APP_STORE_ID?.trim();
const verifyGoogle = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const verifyBing = process.env.BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${BRAND.name} – Das Netzwerk für Selbstgemachtes`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  keywords: SEO_KEYWORDS,
  authors: [{ name: BRAND.name, url: appUrl }],
  creator: BRAND.name,
  publisher: BRAND.name,
  category: "lifestyle",
  // Grosse Bildvorschauen und volle Textauszüge in den Suchergebnissen erlauben
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { type: "website", locale: "de_CH", siteName: BRAND.name },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  // Eigentumsnachweis für Google Search Console / Bing Webmaster Tools (Werte aus den Umgebungsvariablen)
  ...(verifyGoogle || verifyBing ? { verification: { ...(verifyGoogle ? { google: verifyGoogle } : {}), ...(verifyBing ? { other: { "msvalidate.01": verifyBing } } : {}) } } : {}),
  // Safari auf dem iPhone zeigt oben ein Banner „Im App Store laden“ (Smart App Banner)
  ...(appStoreId ? { itunes: { appId: appStoreId } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
      <body className="min-h-dvh">
        <ErrorReporter />
        <VersionWatcher />
        <CategoryRegistrySync data={categoryRegistrySnapshot()} />
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        {children}
        <Toaster />
        <ConfirmHost />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
      </body>
    </html>
  );
}
