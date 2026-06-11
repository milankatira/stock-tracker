import type { NextConfig } from "next";

// Security headers applied to every response (Phase 9 threat model
// T-09-01/02/03). CSP allowlists Vercel Analytics origins only; `next/image`
// needs data:/blob: for optimized image placeholders. `frame-ancestors 'none'`
// + X-Frame-Options DENY mitigate clickjacking.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline' va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' vitals.vercel-insights.com va.vercel-scripts.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const config: NextConfig = {
  // The shared workspace package ships pre-built ESM+CJS via tsup, but
  // listing it here makes Next compile its source directly during dev,
  // which means changes in `packages/shared/src` show up in `apps/web`
  // without re-running `pnpm --filter @finsight/shared build`.
  transpilePackages: ["@finsight/shared"],
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default config;
