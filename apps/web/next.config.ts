import type { NextConfig } from "next";

const s3Host = process.env.S3_PUBLIC_HOST;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Content-Security-Policy als zusätzliche Schutzschicht gegen eingeschleuste Inhalte.
  // Inline-Skripte bleiben erlaubt (Next.js App Router); Fremd-Frames, Plugins und
  // fremde Formularziele sind gesperrt.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@werkraum/shared"],
  serverExternalPackages: ["sharp", "pg", "pg-boss", "web-push"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Besuchte Seiten kurz im Client-Cache halten: Zurück/Vor und Tab-Wechsel ohne Wartezeit
    staleTimes: { dynamic: 30, static: 300 },
  },
  images: {
    remotePatterns: [
      ...(s3Host ? [{ protocol: "https" as const, hostname: s3Host }] : []),
      { protocol: "https", hostname: "*.storageapi.dev" },
      { protocol: "https", hostname: "*.railway.app" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
