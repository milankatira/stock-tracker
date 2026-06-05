import { describe, it, expect, vi, beforeEach } from "vitest";
import { stockFixture } from "./fixtures/instrument-master";

// Layer 3 of the three-layer SDK ban (SEO-04): the AI SDK constructor throws
// if instantiated. A public page render must NEVER reach this code path.
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => {
    throw new Error(
      "AI SDK must not be instantiated during public stock page render (SEO-04)",
    );
  }),
}));

vi.mock("@/lib/data/stock-report", () => ({
  getStockReportFromMaterialisedStore: vi.fn(async () => stockFixture),
  enqueueAdHocStockCompute: vi.fn(async () => undefined),
}));

vi.mock("@/lib/data/instrument-master", () => ({
  getTopNTickers: vi.fn(async () => []),
  getStockInstrument: vi.fn(async () => null),
}));

describe("GET /stock/[ticker] -- AI SDK ban (SEO-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without instantiating the AI SDK", async () => {
    const StockPage = (await import("@/app/stock/[ticker]/page")).default;
    const result = await StockPage({
      params: Promise.resolve({ ticker: "RELIANCE" }),
    });
    expect(result).toBeDefined();
  });
});
