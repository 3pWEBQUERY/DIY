import type { NextConfig } from "next";

const s3Host = process.env.S3_PUBLIC_HOST;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@werkraum/shared"],
  serverExternalPackages: ["sharp", "pg", "pg-boss"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
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
