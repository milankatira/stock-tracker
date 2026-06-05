/**
 * Typed robots.txt for the public SEO surface (SEO-03).
 *
 * Allows the public report trees (`/stock/`, `/fund/`) and the homepage;
 * disallows the authenticated app surface (`/app/`), the internal API
 * (`/api/`), and auth flows (`/auth/`) — none of which should be indexed.
 * Links the sitemap so crawlers discover the full universe of pages.
 *
 * Sitemap URL: because `sitemap.ts` exports `generateSitemaps`, Next.js
 * serves the (sharded) sitemap at `/sitemap/<id>.xml` — NOT at a bare
 * `/sitemap.xml` (verified against Next 15.5 `normalizeMetadataPageToRoute`:
 * a dynamic sitemap maps to `/sitemap/[__metadata_id__]`). The first shard
 * `/sitemap/0.xml` always exists (the universe is a single shard well under
 * the 45k split threshold), so robots points there.
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
    sitemap: `${SITE}/sitemap/0.xml`,
    host: SITE,
  };
}
