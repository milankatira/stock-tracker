import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { fundFixture } from "./fixtures/instrument-master";

vi.mock("@/lib/data/fund-report", () => ({
  getFundReportFromMaterialisedStore: vi.fn(async () => fundFixture),
  enqueueAdHocFundCompute: vi.fn(async () => undefined),
}));

vi.mock("@/lib/data/instrument-master", () => ({
  getTopNFundSchemeCodes: vi.fn(async () => []),
}));

describe("GET /fund/[schemeCode] -- server-rendered HTML (SEO-02, SEO-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderHtml(): Promise<string> {
    const FundPage = (await import("@/app/fund/[schemeCode]/page")).default;
    const element = (await FundPage({
      params: Promise.resolve({ schemeCode: "120503" }),
    })) as ReactElement;
    return renderToStaticMarkup(element);
  }

  it("contains the FinSight Fund Score, verdict, and scheme name", async () => {
    const html = await renderHtml();
    expect(html).toContain("FinSight Fund Score");
    expect(html).toContain("Strong Score");
    expect(html).toContain("Parag Parikh Flexi Cap");
  });

  it("carries both disclaimers in server-rendered HTML", async () => {
    const html = await renderHtml();
    expect(html).toContain("Analysis, not investment advice");
    expect(html).toContain("Past performance");
  });

  it("emits FinancialProduct + Article + BreadcrumbList JSON-LD with no Review/Rating", async () => {
    const html = await renderHtml();
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"FinancialProduct"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain("aggregateRating");
  });

  it("produces a canonical + OG + Twitter via generateMetadata", async () => {
    const { generateMetadata } = await import("@/app/fund/[schemeCode]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ schemeCode: "120503" }),
    });
    expect(meta.alternates?.canonical).toBe("https://finsight.ai/fund/120503");
    expect((meta.openGraph as { type?: string })?.type).toBe("article");
    expect((meta.twitter as { card?: string })?.card).toBe(
      "summary_large_image",
    );
  });
});
