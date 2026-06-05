/**
 * Typed robots.txt for the public SEO surface (SEO-03).
 *
 * Allows the public report trees (`/stock/`, `/fund/`) and the homepage;
 * disallows the authenticated app surface (`/app/`), the internal API
 * (`/api/`), and auth flows (`/auth/`) — none of which should be indexed.
 * Links the sitemap so crawlers discover the full universe of pages.
 *
 * Next.js serialises this to `text/plain` at `/robots.txt`.
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/stock/", "/fund/"],
        disallow: ["/api/", "/app/", "/auth/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
