/**
 * Dynamic sitemap for the public SEO surface (SEO-03).
 *
 * Emits one `<url>` per stock (`/stock/<NSE_SYMBOL>`) and per fund
 * (`/fund/<SCHEMECODE>`) from the instrument master, plus the root URL.
 * Next.js handles XML serialisation, `Content-Type: application/xml`, and
 * caching — this file only supplies the typed `MetadataRoute.Sitemap` array.
 *
 * 50k-cap handling: Google caps a single sitemap at 50,000 URLs. The combined
 * universe today (NIFTY 500 + listed stocks + funds ≈ 7,500) is well under
 * that, but `generateSitemaps` future-proofs the split so growth never trips
 * the cap. Each shard renders `URLS_PER_SITEMAP` entries.
 *
 * Empty-safe: until the Phase-2 public instrument endpoint exists,
 * `listAllTickers` / `listAllSchemeCodes` return `[]`, so the sitemap emits
 * only the root URL — `next build` succeeds and a transient instrument-master
 * outage serves the last-good cached sitemap rather than de-indexing the site
 * (threat T-08-21).
 */
import type { MetadataRoute } from "next";
import {
  listAllTickers,
  listAllSchemeCodes,
} from "@/lib/data/instrument-master";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";
// Safety margin under Google's hard 50,000-URL-per-sitemap cap.
const URLS_PER_SITEMAP = 45000;

/**
 * Declares how many sitemap shards exist. Next calls `sitemap({ id })` once
 * per returned `id`. Always returns at least one shard so `/sitemap.xml`
 * resolves even when the universe is empty.
 */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const [tickers, schemes] = await Promise.all([
    listAllTickers(),
    listAllSchemeCodes(),
  ]);
  const total = tickers.length + schemes.length + 1; // +1 for the root URL
  const count = Math.max(1, Math.ceil(total / URLS_PER_SITEMAP));
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const [tickers, schemes] = await Promise.all([
    listAllTickers(),
    listAllSchemeCodes(),
  ]);

  const all: MetadataRoute.Sitemap = [
    {
      url: SITE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...tickers.map((t) => ({
      url: `${SITE}/stock/${t.symbol}`,
      lastModified: t.lastReportComputedAt ?? new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...schemes.map((s) => ({
      url: `${SITE}/fund/${s.schemeCode}`,
      lastModified: s.lastReportComputedAt ?? new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];

  const start = id * URLS_PER_SITEMAP;
  return all.slice(start, start + URLS_PER_SITEMAP);
}
