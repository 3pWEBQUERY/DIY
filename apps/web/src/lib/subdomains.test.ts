import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES, isProfileLabel, profileLabel, profileSubdomainUrl, subdomainAction, subdomainBase } from "./subdomains";

describe("subdomainBase", () => {
  it("macht aus Punkt und Unterstrich einen Bindestrich", () => {
    expect(subdomainBase("lena.haekelt")).toBe("lena-haekelt");
    expect(subdomainBase("mira_strickt")).toBe("mira-strickt");
    expect(subdomainBase("a__b..c")).toBe("a-b-c");
    expect(subdomainBase("werkuno")).toBe("werkuno");
  });
});

describe("profileLabel", () => {
  it("erkennt nur Subdomains der Profil-Domain, eine Ebene tief", () => {
    expect(profileLabel("whizz.werkuno.ch", "werkuno.ch")).toBe("whizz");
    expect(profileLabel("Whizz.Werkuno.CH:443", "werkuno.ch")).toBe("whizz");
    expect(profileLabel("werkuno.ch", "werkuno.ch")).toBeNull();
    expect(profileLabel("a.b.werkuno.ch", "werkuno.ch")).toBeNull();
    expect(profileLabel("werkuno-production.up.railway.app", "werkuno.ch")).toBeNull();
    expect(profileLabel("evilwerkuno.ch", "werkuno.ch")).toBeNull();
  });
  it("lässt reservierte und ungültige Labels nicht als Profil zu", () => {
    expect(isProfileLabel("werkuno")).toBe(true);
    expect(isProfileLabel("lena-haekelt--2")).toBe(true);
    expect(isProfileLabel("www")).toBe(false);
    expect(isProfileLabel("api")).toBe(false);
    expect(isProfileLabel("-lena")).toBe(false);
  });
});

describe("subdomainAction", () => {
  const h = "lena.haekelt";
  it("zeigt Profil, Projekte und Blog unter der Subdomain", () => {
    expect(subdomainAction("/", h)).toEqual({ type: "rewrite", path: "/u/lena.haekelt" });
    expect(subdomainAction("/granny-decke", h)).toEqual({ type: "rewrite", path: "/u/lena.haekelt/granny-decke" });
    expect(subdomainAction("/blog/mein-artikel", h)).toEqual({ type: "rewrite", path: "/u/lena.haekelt/blog/mein-artikel" });
    expect(subdomainAction("/medienkit", h)).toEqual({ type: "rewrite", path: "/u/lena.haekelt/medienkit" });
  });
  it("lässt Assets, Medien, API und das eigene /u/ unverändert", () => {
    for (const p of ["/api/v1/me", "/media/m/x/md.webp", "/_next/data/x.json", "/placeholders/projekt-640.webp", "/robots.txt", "/sw.js", "/u/lena.haekelt/granny-decke"]) {
      expect(subdomainAction(p, h)).toEqual({ type: "pass" });
    }
  });
  it("schickt App-Bereiche und fremde Profile zur Hauptdomain", () => {
    for (const p of ["/feed", "/anmelden", "/markt/test-shop/x", "/studio", "/admin", "/u/mattia.holz"]) {
      expect(subdomainAction(p, h)).toEqual({ type: "main" });
    }
  });
});

describe("APP_ROUTES", () => {
  it("entspricht den Ordnern unter src/app (sonst landen neue Seiten fälschlich im Profil)", () => {
    const root = join(__dirname, "..", "app");
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (!statSync(p).isDirectory()) continue;
        if (e.startsWith("(")) walk(p);
        else if (!e.startsWith("[") && !e.startsWith("_") && !e.startsWith("@")) found.add(e);
      }
    };
    walk(root);
    // Auf jeder Domain gleich ausgeliefert bzw. das Profil selbst
    for (const x of ["api", "media", "u"]) found.delete(x);
    expect([...found].sort()).toEqual([...APP_ROUTES].sort());
  });
});

describe("profileSubdomainUrl", () => {
  it("baut die Adresse nur, wenn Subdomains aktiv sind", () => {
    expect(profileSubdomainUrl("werkuno", "werkuno.ch")).toBe("https://werkuno.werkuno.ch");
    expect(profileSubdomainUrl("werkuno", null)).toBeNull();
    expect(profileSubdomainUrl(null, "werkuno.ch")).toBeNull();
  });
});
