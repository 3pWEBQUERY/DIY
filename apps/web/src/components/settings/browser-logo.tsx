import Image from "next/image";
import { Monitor } from "lucide-react";
import { BROWSER_LOGOS } from "./browser-logos.data";
export { browserFromUserAgent } from "@/lib/user-agent";

/** Original-Logo des Browsers (bzw. Werkuno-Icon für die App), sonst neutrales Gerätesymbol. */
export function BrowserLogo({ browser, size = 22 }: { browser: string | null; size?: number }) {
  if (browser === "app") return <Image src="/brand/werkuno-icon-192.png" alt="" width={size} height={size} aria-hidden />;
  const logo = browser ? BROWSER_LOGOS[browser] : undefined;
  if (!logo) return <Monitor size={size - 4} strokeWidth={1.6} aria-hidden />;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${logo.w} ${logo.h}`} aria-hidden preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: logo.body }} />
  );
}
