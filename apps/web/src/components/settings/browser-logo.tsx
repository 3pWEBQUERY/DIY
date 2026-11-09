import Image from "next/image";
import { Monitor } from "lucide-react";
import { BROWSER_LOGOS } from "./browser-logos.data";
export { browserFromUserAgent } from "@/lib/user-agent";

/** Original-Logo des Browsers (bzw. Werkuno-Icon für die App), sonst neutrales Gerätesymbol. */
export function BrowserLogo({ browser, size = 22 }: { browser: string | null; size?: number }) {
  if (browser === "app") return <Image src="/brand/werkuno-icon-192.png" alt="" width={size} height={size} aria-hidden />;
  const logo = browser ? BROWSER_LOGOS[browser] : undefined;
  if (!logo) return <Monitor size={size - 4} strokeWidth={1.6} aria-hidden />;
  // Als Bild (data-URI) statt Inline-SVG: die Logos enthalten Verlaufs-IDs, die sonst bei mehreren
  // Geräten derselben Art doppelt im Dokument stünden (ungültiges HTML, stört Screenreader-Prüfungen)
  const src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logo.w} ${logo.h}" preserveAspectRatio="xMidYMid meet">${logo.body}</svg>`)}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" aria-hidden />;
}
