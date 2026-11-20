import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

/** Web-App-Manifest: Name und Icon für „Zum Home-Bildschirm“. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stabile App-Identität; entspricht der bisher aus start_url abgeleiteten ID, damit
    // bestehende Installationen dieselbe App bleiben
    id: "/feed",
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: BRAND.locale,
    dir: "ltr",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF8F5",
    theme_color: "#FAF8F5",
    categories: ["lifestyle", "social", "shopping", "education"],
    // „any“: Originalicon (transparent). „maskable“: eigene Variante mit deckendem Hintergrund und dem
    // Logo innerhalb der Safe Zone (Kreis mit 80 % Durchmesser) – Android schneidet sie rund/eckig zu.
    icons: [
      { src: "/brand/werkuno-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/werkuno-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/werkuno-icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/werkuno-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Langes Drücken auf das App-Symbol (Android)
    shortcuts: [
      { name: "Entdecken", url: "/entdecken", icons: [{ src: "/brand/werkuno-icon-maskable-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Projekt erstellen", short_name: "Erstellen", url: "/erstellen", icons: [{ src: "/brand/werkuno-icon-maskable-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Marktplatz", url: "/markt", icons: [{ src: "/brand/werkuno-icon-maskable-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Benachrichtigungen", url: "/benachrichtigungen", icons: [{ src: "/brand/werkuno-icon-maskable-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
