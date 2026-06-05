/**
 * sitemap.ts unit tests (SEO-03).
 *
 * Mocks the instrument-master read layer so the test is deterministic and
 * independent of the (still-empty) Phase-2 public endpoint. Asserts the
 * default `https://finsight.ai` origin (NEXT_PUBLIC_SITE_URL unset in tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listAllTickers = vi.fn();
const listAllSchemeCodes = vi.fn();

vi.mock("@/lib/data/instrument-master", () => ({
  listAllTickers: () => listAllTickers(),
  listAllSchemeCodes: () => listAllSchemeCodes(),
}));

const SITE = "https://finsight.ai";

describe("sitemap (SEO-03)", () => {
  beforeEach(() => {
    listAllTickers.mockReset();
    listAllSchemeCodes.mockReset();
  });

  it("emits one entry per stock and per fund plus the root URL", async () => {
    listAllTickers.mockResolvedValue([
      { symbol: "RELIANCE", lastReportComputedAt: new Date("2026-05-27") },
    ]);
    listAllSchemeCodes.mockResolvedValue([
      { schemeCode: "120503", lastReportComputedAt: new Date("2026-05-27") },
    ]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap({ id: 0 });
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(SITE);
    expect(urls).toContain(`${SITE}/stock/RELIANCE`);
    expect(urls).toContain(`${SITE}/fund/120503`);
    expect(entries).toHaveLength(3);
  });

  it("marks instrument entries as changeFrequency 'daily'", async () => {
    listAllTickers.mockResolvedValue([
      { symbol: "TCS", lastReportComputedAt: new Date("2026-05-27") },
    ]);
    listAllSchemeCodes.mockResolvedValue([{ schemeCode: "118989" }]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap({ id: 0 });

    const stock = entries.find((e) => e.url === `${SITE}/stock/TCS`);
    const fund = entries.find((e) => e.url === `${SITE}/fund/118989`);
    expect(stock?.changeFrequency).toBe("daily");
    expect(fund?.changeFrequency).toBe("daily");
  });

  it("falls back to a present lastModified when no report timestamp exists", async () => {
    listAllTickers.mockResolvedValue([{ symbol: "INFY" }]);
    listAllSchemeCodes.mockResolvedValue([]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap({ id: 0 });

    const stock = entries.find((e) => e.url === `${SITE}/stock/INFY`);
    expect(stock?.lastModified).toBeInstanceOf(Date);
  });

  it("emits only the root URL when the instrument master is empty", async () => {
    listAllTickers.mockResolvedValue([]);
    listAllSchemeCodes.mockResolvedValue([]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap({ id: 0 });

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(SITE);
  });

  it("generateSitemaps returns at least one shard (future-proofs the 50k cap)", async () => {
    listAllTickers.mockResolvedValue([]);
    listAllSchemeCodes.mockResolvedValue([]);

    const { generateSitemaps } = await import("@/app/sitemap");
    const shards = await generateSitemaps();

    expect(shards.length).toBeGreaterThanOrEqual(1);
    expect(shards[0]).toEqual({ id: 0 });
  });
});
