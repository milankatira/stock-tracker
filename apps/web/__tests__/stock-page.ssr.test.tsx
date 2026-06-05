import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { stockFixture } from "./fixtures/instrument-master";

vi.mock("@/lib/data/stock-report", () => ({
  getStockReportFromMaterialisedStore: vi.fn(async () => stockFixture),
  enqueueAdHocStockCompute: vi.fn(async () => undefined),
}));

vi.mock("@/lib/data/instrument-master", () => ({
  getTopNTickers: vi.fn(async () => []),
  getStockInstrument: vi.fn(async () => null),
}));

describe("GET /stock/[ticker] -- server-rendered HTML (SEO-01, SEO-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderHtml(): Promise<string> {
    const StockPage = (await import("@/app/stock/[ticker]/page")).default;
    const element = (await StockPage({
      params: Promise.resolve({ ticker: "RELIANCE" }),
    })) as ReactElement;
    return renderToStaticMarkup(element);
  }

  it("contains the FinSight Score, verdict label, and summary in view-source HTML", async () => {
    const html = await renderHtml();
    expect(html).toContain("FinSight Score");
    expect(html).toContain("Strong Score");
    expect(html).toContain("diversified conglomerate");
  });

  it("carries the analysis-not-advice + past-performance disclaimers", async () => {
    const html = await renderHtml();
    expect(html).toContain("Analysis, not investment advice");
    expect(html).toContain("Past performance");
  });

  it("emits Corporation + Article + BreadcrumbList JSON-LD with no Review/Rating", async () => {
    const html = await renderHtml();
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"Corporation"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('"@type":"Review"');
    expect(html).not.toContain('"@type":"Rating"');
    expect(html).not.toContain("aggregateRating");
  });

  it("produces a canonical + OG + Twitter via generateMetadata", async () => {
    const { generateMetadata } = await import("@/app/stock/[ticker]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ ticker: "RELIANCE" }),
    });
    expect(meta.alternates?.canonical).toBe("https://finsight.ai/stock/RELIANCE");
    expect((meta.openGraph as { type?: string })?.type).toBe("article");
    expect((meta.twitter as { card?: string })?.card).toBe(
      "summary_large_image",
    );
  });
});
