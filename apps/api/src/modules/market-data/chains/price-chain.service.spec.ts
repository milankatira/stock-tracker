import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderResult, Quote } from "@finsight/shared";
import type { NseAdapter } from "../nse.adapter";
import type { YahooAdapter } from "../yahoo.adapter";
import type { StaleCacheService } from "../stale-cache/stale-cache.service";
import { PriceChainService } from "./price-chain.service";

function quoteResult(price: number, source: string): ProviderResult<Quote> {
  return {
    status: "ok",
    source,
    fetchedAt: new Date(),
    data: { price, asOf: new Date(), currency: "INR" },
  };
}

function makeYahoo(result: ProviderResult<Quote>): YahooAdapter {
  return {
    getLatestQuote: vi.fn().mockResolvedValue(result),
    getDailyHistory: vi.fn(),
    getFundamentals: vi.fn(),
  } as unknown as YahooAdapter;
}

function makeNse(result: ProviderResult<Quote>): NseAdapter {
  return {
    getLatestQuote: vi.fn().mockResolvedValue(result),
    getDailyHistory: vi.fn(),
    getFundamentals: vi.fn(),
    getCorporateActions: vi.fn(),
  } as unknown as NseAdapter;
}

function makeStale(): StaleCacheService & {
  write: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  } as unknown as StaleCacheService & {
    write: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
}

describe("PriceChainService.getLatestQuote", () => {
  let yahoo: YahooAdapter;
  let nse: NseAdapter;
  let stale: ReturnType<typeof makeStale>;

  beforeEach(() => {
    yahoo = makeYahoo(quoteResult(2540, "yahoo-finance2"));
    nse = makeNse(quoteResult(2538, "stock-nse-india"));
    stale = makeStale();
  });

  it("uses Yahoo first and writes to stale-cache on ok", async () => {
    const chain = new PriceChainService(yahoo, nse, stale as unknown as StaleCacheService);

    const result = await chain.getLatestQuote("RELIANCE.NS");

    expect(yahoo.getLatestQuote).toHaveBeenCalledOnce();
    expect(nse.getLatestQuote).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ok", source: "yahoo-finance2" });
    expect(stale.write).toHaveBeenCalledOnce();
  });

  it("falls back to NSE when Yahoo errs", async () => {
    yahoo = makeYahoo({
      status: "err",
      reason: "upstream-5xx",
      message: "server down",
      source: "yahoo-finance2",
    });
    const chain = new PriceChainService(yahoo, nse, stale as unknown as StaleCacheService);

    const result = await chain.getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({ status: "ok", source: "stock-nse-india" });
    expect(stale.write).toHaveBeenCalledOnce();
  });

  it("falls back to NSE when the Yahoo adapter throws", async () => {
    yahoo = {
      getLatestQuote: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")),
    } as unknown as YahooAdapter;
    const chain = new PriceChainService(yahoo, nse, stale as unknown as StaleCacheService);

    const result = await chain.getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({ status: "ok", source: "stock-nse-india" });
  });

  it("serves stale-cache with stalenessSeconds when both providers err", async () => {
    yahoo = makeYahoo({
      status: "err",
      reason: "upstream-5xx",
      message: "",
      source: "yahoo-finance2",
    });
    nse = makeNse({
      status: "err",
      reason: "validation",
      message: "",
      source: "stock-nse-india",
    });
    stale.read.mockResolvedValueOnce({
      value: { price: 2535, asOf: new Date(), currency: "INR" },
      stalenessSeconds: 120,
    });
    const chain = new PriceChainService(yahoo, nse, stale as unknown as StaleCacheService);

    const result = await chain.getLatestQuote("RELIANCE.NS");

    expect(result.status).toBe("stale");
    if (result.status !== "stale") return;
    expect(result.stalenessSeconds).toBe(120);
    expect(result.data.price).toBe(2535);
  });

  it("returns unknown err when both providers err and stale-cache is empty", async () => {
    yahoo = makeYahoo({
      status: "err",
      reason: "upstream-5xx",
      message: "",
      source: "yahoo-finance2",
    });
    nse = makeNse({
      status: "err",
      reason: "validation",
      message: "",
      source: "stock-nse-india",
    });
    const chain = new PriceChainService(yahoo, nse, stale as unknown as StaleCacheService);

    const result = await chain.getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({ status: "err", reason: "unknown" });
  });
});
