import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yahooFinance from "yahoo-finance2";
import yahooQuoteFixture from "../../../test/fixtures/yahoo-quote.json";
import yahooHistoryFixture from "../../../test/fixtures/yahoo-history.json";
import { YahooAdapter } from "./yahoo.adapter";

vi.mock("yahoo-finance2", () => ({
  default: {
    quote: vi.fn(),
    historical: vi.fn(),
    quoteSummary: vi.fn(),
  },
}));

const mockedYahoo = yahooFinance as unknown as {
  quote: ReturnType<typeof vi.fn>;
  historical: ReturnType<typeof vi.fn>;
  quoteSummary: ReturnType<typeof vi.fn>;
};

function makeAdapter(): YahooAdapter {
  return new YahooAdapter();
}

beforeEach(() => {
  mockedYahoo.quote.mockReset();
  mockedYahoo.historical.mockReset();
  mockedYahoo.quoteSummary.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("YahooAdapter.getLatestQuote", () => {
  it("returns an ok envelope with Quote shape for a valid mocked quote", async () => {
    mockedYahoo.quote.mockResolvedValueOnce(yahooQuoteFixture);

    const result = await makeAdapter().getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({
      status: "ok",
      source: "yahoo-finance2",
      data: { price: 2543.5, currency: "INR" },
    });
    if (result.status === "ok") {
      expect(result.data.asOf).toBeInstanceOf(Date);
      expect(result.fetchedAt).toBeInstanceOf(Date);
    }
  });

  it("returns a validation err when the payload is missing regularMarketPrice", async () => {
    mockedYahoo.quote.mockResolvedValueOnce({
      symbol: "RELIANCE.NS",
      currency: "INR",
      regularMarketTime: 1716883800,
    });

    const result = await makeAdapter().getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({
      status: "err",
      reason: "validation",
      source: "yahoo-finance2",
    });
  });

  it("rethrows non-validation errors so the upstream circuit breaker can count them", async () => {
    mockedYahoo.quote.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(makeAdapter().getLatestQuote("RELIANCE.NS")).rejects.toThrow(
      "ETIMEDOUT",
    );
  });
});

describe("YahooAdapter.getDailyHistory", () => {
  it("uses adjClose as the canonical close and preserves rawClose for audit", async () => {
    mockedYahoo.historical.mockResolvedValueOnce(yahooHistoryFixture);

    const result = await makeAdapter().getDailyHistory(
      "RELIANCE.NS",
      new Date("2026-05-12T00:00:00.000Z"),
      new Date("2026-05-23T23:59:59.000Z"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(10);
    const splitBar = result.data[9];
    expect(splitBar.rawClose).toBe(2500);
    expect(splitBar.close).toBe(500);
  });

  it("returns a validation err when a bar is missing adjClose", async () => {
    const corrupted = yahooHistoryFixture.map((bar, index) =>
      index === 0 ? { ...bar, adjClose: undefined } : bar,
    );
    mockedYahoo.historical.mockResolvedValueOnce(corrupted);

    const result = await makeAdapter().getDailyHistory(
      "RELIANCE.NS",
      new Date(),
      new Date(),
    );

    expect(result).toMatchObject({ status: "err", reason: "validation" });
  });
});

describe("YahooAdapter.getFundamentals", () => {
  it("flattens raw module fields and preserves the pass-through bag for the scorer", async () => {
    mockedYahoo.quoteSummary.mockResolvedValueOnce({
      price: { marketCap: { raw: 1_500_000_000_000 } },
      summaryDetail: {
        trailingPE: { raw: 24.5 },
        priceToBook: { raw: 3.1 },
        beta: { raw: 1.05 },
      },
      financialData: {
        returnOnEquity: { raw: 0.18 },
        debtToEquity: { raw: 0.42 },
      },
      defaultKeyStatistics: {
        sharesOutstanding: { raw: 6_770_000_000 },
      },
    });

    const result = await makeAdapter().getFundamentals("RELIANCE.NS", [
      "price",
      "summaryDetail",
      "financialData",
      "defaultKeyStatistics",
    ]);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toMatchObject({
      marketCap: 1_500_000_000_000,
      trailingPE: 24.5,
      priceToBook: 3.1,
      beta: 1.05,
      returnOnEquity: 0.18,
      debtToEquity: 0.42,
      sharesOutstanding: 6_770_000_000,
    });
    expect(result.data.raw).toBeDefined();
  });

  it("returns a validation err when an SDK module field is malformed", async () => {
    mockedYahoo.quoteSummary.mockResolvedValueOnce({
      price: { marketCap: { raw: "not-a-number" } },
    });

    const result = await makeAdapter().getFundamentals("RELIANCE.NS", ["price"]);

    expect(result).toMatchObject({ status: "err", reason: "validation" });
  });
});
