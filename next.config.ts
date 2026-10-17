import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isHttps =
  process.env.FORCE_HTTPS === "true" ||
  Boolean(process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"));

// Defense-in-depth CSP. 'unsafe-inline' for scripts/styles is required while
// login/signup/not-found are statically prerendered (nonces need dynamic
// rendering everywhere — see node_modules/next/dist/docs content-security-policy
// guide). Follow-up: convert those pages to dynamic rendering, then switch to
// nonce + 'strict-dynamic' and drop 'unsafe-inline' from script-src.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://images.unsplash.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "bcryptjs"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(isHttps
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
        : []),
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
