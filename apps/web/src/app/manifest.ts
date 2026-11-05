import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

/** Web-App-Manifest: Name und Icon für „Zum Home-Bildschirm“. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/feed",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#FAF8F5",
    icons: [
      { src: "/brand/werkuno-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/werkuno-icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
