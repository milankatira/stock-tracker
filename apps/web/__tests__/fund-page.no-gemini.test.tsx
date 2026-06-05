import { describe, it, expect, vi, beforeEach } from "vitest";
import { fundFixture } from "./fixtures/instrument-master";

// Layer 3 of the three-layer SDK ban (SEO-04) for the fund route.
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => {
    throw new Error(
      "AI SDK must not be instantiated during public fund page render (SEO-04)",
    );
  }),
}));

vi.mock("@/lib/data/fund-report", () => ({
  getFundReportFromMaterialisedStore: vi.fn(async () => fundFixture),
  enqueueAdHocFundCompute: vi.fn(async () => undefined),
}));

vi.mock("@/lib/data/instrument-master", () => ({
  getTopNFundSchemeCodes: vi.fn(async () => []),
}));

describe("GET /fund/[schemeCode] -- AI SDK ban (SEO-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without instantiating the AI SDK", async () => {
    const FundPage = (await import("@/app/fund/[schemeCode]/page")).default;
    const result = await FundPage({
      params: Promise.resolve({ schemeCode: "120503" }),
    });
    expect(result).toBeDefined();
  });
});
