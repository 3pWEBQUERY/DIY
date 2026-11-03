import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { Toaster } from "@/components/ui/toast";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${BRAND.name} – Das Netzwerk für Selbstgemachtes`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { type: "website", locale: "de_CH", siteName: BRAND.name },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FAF9F6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
