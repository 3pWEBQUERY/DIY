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
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#FAF8F5",
    // Nur „any“: Das vorhandene Icon füllt die Fläche fast bis zum Rand und hat keinen deckenden
    // Hintergrund – als „maskable“ würden die Ecken der vier Kacheln von der runden Maske abgeschnitten
    // (Safe Zone = Kreis mit 80 % Durchmesser). Für ein maskierbares Icon braucht es eine eigene Variante.
    icons: [
      { src: "/brand/werkuno-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/werkuno-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
