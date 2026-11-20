/**
 * Profil-Subdomains: https://{subdomain}.werkuno.ch zeigt das Profil /u/{handle}.
 *
 * Die Subdomain wird in der Datenbank aus dem Handle abgeleitet (Trigger auf "UserProfile", siehe Migration
 * 20261124100000_profile_subdomains). Diese Datei enthält dieselbe Ableitung für Anzeige und Tests sowie die
 * Regeln, welche Pfade auf einer Profil-Subdomain zum Profil gehören und welche zur Hauptdomain.
 *
 * Reine Funktionen ohne Server-Abhängigkeiten – werden vom Proxy und von Komponenten genutzt.
 */

/** Subdomains, die nie ein Profil sein dürfen (Infrastruktur, Marke, App-Bereiche). Muss zur Migration passen. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "admin", "mail", "smtp", "imap", "pop", "webmail", "email", "ns", "ns1", "ns2", "mx",
  "autodiscover", "autoconfig", "status", "cdn", "static", "assets", "media", "img", "images", "files", "docs",
  "help", "hilfe", "support", "blog", "shop", "markt", "studio", "dev", "staging", "test", "beta", "demo", "auth",
  "login", "account", "accounts", "billing", "pay", "payment", "payments", "stripe", "go", "link", "links", "news",
  "newsletter", "community", "forum", "apple", "pinterest", "ftp", "sftp", "git", "vpn", "secure", "m", "mobile",
  "web", "intranet", "internal", "portal", "werkraum", "root", "system", "moderation", "u", "p", "t",
]);

/** Grundform der Subdomain aus einem Handle: Punkt/Unterstrich → Bindestrich (DNS erlaubt beides nicht). */
export function subdomainBase(handle: string): string {
  const b = handle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return b || "profil";
}

/**
 * Oberste Pfadsegmente der App (Ordner unter src/app ohne Routengruppen). Auf einer Profil-Subdomain werden
 * diese zur Hauptdomain weitergeleitet – dort gilt die Anmeldung. Ein Test hält die Liste mit dem Dateisystem
 * synchron.
 */
export const APP_ROUTES = new Set([
  "abbestellen", "admin", "anleitungen", "anmelden", "beitrag", "beleg", "benachrichtigungen", "bestellungen",
  "beta", "blogs", "c", "communities", "e-mail-bestaetigen", "einkaufslisten", "einspruch", "einstellungen",
  "entdecken", "erstellen", "events", "feed", "gespeichert", "go", "gutschein", "hashtag", "highlights", "hilfe", "kasse", "kontakt", "liste", "markt",
  "materialien", "nachrichten", "passwort-vergessen", "passwort-zuruecksetzen", "profil", "projekte",
  "rechtliches", "registrieren", "richtlinien", "sammlungen", "sitemap_index.xml", "stories", "studio", "suche", "verifizieren", "warenkorb",
  "werkzeuge", "wettbewerbe", "willkommen",
]);

/** Pfade, die auf jeder Domain gleich ausgeliefert werden (Assets, Medien, Schnittstellen). */
const PASSTHROUGH = new Set(["api", "media", "_next", "placeholders", "auth", "welcome", "brand", "three"]);

/** Liefert das Subdomain-Label für einen Host – oder null, wenn es keine Profil-Subdomain ist. */
export function profileLabel(host: string, domain: string): string | null {
  const h = host.toLowerCase().split(":")[0]!.replace(/\.$/, "");
  const d = domain.toLowerCase();
  if (h === d || !h.endsWith(`.${d}`)) return null;
  const label = h.slice(0, -(d.length + 1));
  // Nur eine Ebene (lena.werkuno.ch), keine tieferen Hosts
  if (!label || label.includes(".")) return null;
  return label;
}

/** Gültige Form eines Profil-Labels (wie vom Trigger erzeugt). */
export function isProfileLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !RESERVED_SUBDOMAINS.has(label);
}

export type SubdomainAction = { type: "pass" } | { type: "rewrite"; path: string } | { type: "main" };

/**
 * Was mit einem Pfad auf {label}.werkuno.ch passiert:
 * - „/“, „/blog“, „/{projekt}“ … → intern auf /u/{handle}/… (URL bleibt)
 * - „/u/{handle}/…“, Assets, Medien, API → unverändert
 * - App-Bereiche („/feed“, „/anmelden“ …) und fremde Profile → zur Hauptdomain
 */
export function subdomainAction(pathname: string, handle: string): SubdomainAction {
  const segs = pathname.split("/").filter(Boolean);
  const first = segs[0];
  if (!first) return { type: "rewrite", path: `/u/${handle}` };
  if (first === "u") return segs[1]?.toLowerCase() === handle ? { type: "pass" } : { type: "main" };
  if (PASSTHROUGH.has(first)) return { type: "pass" };
  // Dateien im Wurzelverzeichnis (robots.txt, sw.js, Icons, Manifest …)
  if (segs.length === 1 && first.includes(".")) return { type: "pass" };
  if (APP_ROUTES.has(first)) return { type: "main" };
  return { type: "rewrite", path: `/u/${handle}/${segs.join("/")}` };
}

/** Öffentliche Adresse eines Profils, wenn Subdomains aktiv sind. */
export function profileSubdomainUrl(subdomain: string | null | undefined, domain: string | null | undefined): string | null {
  if (!subdomain || !domain) return null;
  return `https://${subdomain}.${domain}`;
}
