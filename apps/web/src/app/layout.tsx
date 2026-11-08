import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { Toaster } from "@/components/ui/toast";
import { Suspense } from "react";
import { NavProgress } from "@/components/shell/page-transition";
import { categoryRegistrySnapshot } from "@werkraum/shared";
import { CategoryRegistrySync } from "@/components/shell/category-registry";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${BRAND.name} – Das Netzwerk für Selbstgemachtes`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { type: "website", locale: "de_CH", siteName: BRAND.name },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
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
        <CategoryRegistrySync data={categoryRegistrySnapshot()} />
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        {children}
        <Toaster />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
      </body>
    </html>
  );
}
