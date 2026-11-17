import { NextResponse, type NextRequest } from "next/server";
import { isProfileLabel, profileLabel, subdomainAction } from "@/lib/subdomains";
import { handleForSubdomain } from "@/server/subdomain-lookup";

/**
 * Profil-Subdomains: {subdomain}.werkuno.ch zeigt /u/{handle}, ohne dass sich die Adresse ändert.
 * Aktiv nur mit PROFILE_DOMAIN (z. B. „werkuno.ch“); auf der Hauptdomain passiert hier nichts.
 * App-Bereiche (Feed, Anmelden, Studio …) leiten zur Hauptdomain – dort gilt die Anmeldung.
 */
export async function proxy(req: NextRequest) {
  const domain = process.env.PROFILE_DOMAIN?.trim().toLowerCase();
  if (!domain) return NextResponse.next();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim();
  const label = profileLabel(host, domain);
  if (label === null) return NextResponse.next();

  const main = mainOrigin(domain);
  const toMain = (path: string) => NextResponse.redirect(new URL(path, main), 308);
  if (label === "www") return toMain(req.nextUrl.pathname + req.nextUrl.search);
  if (!isProfileLabel(label)) return toMain("/");

  const handle = await handleForSubdomain(label).catch(() => null);
  if (!handle) return NextResponse.redirect(new URL("/", main), 307);

  const action = subdomainAction(req.nextUrl.pathname, handle);
  if (action.type === "pass") return NextResponse.next();
  if (action.type === "main") {
    // Daten-Abrufe des Routers (Vorladen, Klick) sind kein Seitenaufruf: Eine Umleitung über Domains hinweg
    // würde der Browser als CORS-Fehler melden. Eine leere Antwort ohne RSC-Inhalt lässt Next.js normal zur
    // Seite navigieren, die dann per 308 auf die Hauptdomain wechselt. (Die internen RSC-Header entfernt Next.js
    // vor dem Proxy, daher die Unterscheidung über Browser-Header.)
    if (!isDocumentRequest(req)) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return toMain(req.nextUrl.pathname + req.nextUrl.search);
  }
  const url = req.nextUrl.clone();
  url.pathname = action.path;
  return NextResponse.rewrite(url);
}

/** Echter Seitenaufruf (Adresszeile, Link ohne Router) – im Gegensatz zu fetch() des Next-Routers. */
function isDocumentRequest(req: NextRequest) {
  const dest = req.headers.get("sec-fetch-dest");
  if (dest) return dest === "document" || dest === "iframe";
  return (req.headers.get("accept") ?? "").includes("text/html");
}

/** Hauptdomain mit Protokoll – aus APP_URL, wenn sie zur Domain passt. */
function mainOrigin(domain: string) {
  try {
    const u = new URL(process.env.APP_URL ?? "");
    if (u.hostname === domain || u.hostname === `www.${domain}`) return u.origin;
  } catch {}
  return `https://${domain}`;
}

export const config = {
  // Statische Next-Dateien nie über den Proxy schicken
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
