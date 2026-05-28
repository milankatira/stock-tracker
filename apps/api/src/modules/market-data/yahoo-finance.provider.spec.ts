import { describe, expect, it, vi } from "vitest";
import { getYahooQuote } from "./yahoo-finance.provider";

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

const yahooBody = {
  chart: {
    result: [
      {
        meta: {
          symbol: "RELIANCE.NS",
          regularMarketPrice: 2450.5,
          currency: "INR",
          regularMarketTime: 1_700_000_000,
        },
      },
    ],
    error: null,
  },
};

describe("getYahooQuote", () => {
  it("fetches and maps a Yahoo chart quote", async () => {
    const fetcher = vi.fn(async () => makeResponse(yahooBody));

    await expect(getYahooQuote("RELIANCE.NS", fetcher)).resolves.toEqual({
      symbol: "RELIANCE.NS",
      price: 2450.5,
      currency: "INR",
      asOf: new Date(1_700_000_000 * 1000).toISOString(),
      source: "yahoo-finance",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d",
    );
  });

  it("wraps non-2xx quote responses", async () => {
    const fetcher = vi.fn(async () => makeResponse({}, false, 503));

    await expect(getYahooQuote("RELIANCE.NS", fetcher)).rejects.toThrow(
      "YahooFinanceProvider: quote request failed with status 503",
    );
  });

  it("rejects malformed quote payloads", async () => {
    const fetcher = vi.fn(async () => makeResponse({ chart: { result: [], error: null } }));

    await expect(getYahooQuote("RELIANCE.NS", fetcher)).rejects.toThrow(
      "YahooFinanceProvider: malformed quote response",
    );
  });

  it("rejects non-INR quote payloads", async () => {
    const fetcher = vi.fn(async () =>
      makeResponse({
        chart: {
          result: [
            {
              meta: {
                symbol: "AAPL",
                regularMarketPrice: 180.25,
                currency: "USD",
                regularMarketTime: 1_700_000_000,
              },
            },
          ],
          error: null,
        },
      }),
    );

    await expect(getYahooQuote("AAPL", fetcher)).rejects.toThrow(
      "YahooFinanceProvider: expected INR quote currency",
    );
  });
});
