import { describe, expect, it, vi } from "vitest";
import { TTL } from "../cache/ttl-policy";
import type { CacheService } from "../cache/cache.service";
import {
  MarketDataService,
  type MarketDataProvider,
} from "./market-data.service";

function makeService(): {
  service: MarketDataService;
  cache: CacheService;
  provider: MarketDataProvider;
} {
  const provider = {
    getQuote: vi.fn(async () => ({
      symbol: "RELIANCE.NS",
      price: 2450.5,
      currency: "INR" as const,
      asOf: "2026-05-28T06:00:00.000Z",
      source: "fixture",
    })),
  } satisfies MarketDataProvider;
  const cache = {
    getOrSet: vi.fn(async (_key: string, _ttl: number, producer: () => Promise<unknown>) =>
      producer(),
    ),
  } as unknown as CacheService;
  return { service: new MarketDataService(cache, provider), cache, provider };
}

describe("MarketDataService", () => {
  it("normalizes Indian stock symbols to NSE suffix by default", async () => {
    const { service, provider } = makeService();

    await service.getStockQuote(" reliance ");

    expect(provider.getQuote).toHaveBeenCalledWith("RELIANCE.NS");
  });

  it("preserves explicit exchange suffixes", async () => {
    const { service, provider } = makeService();

    await service.getStockQuote("TCS.BO");

    expect(provider.getQuote).toHaveBeenCalledWith("TCS.BO");
  });

  it("caches stock quote lookups with the short quote TTL", async () => {
    const { service, cache } = makeService();

    await expect(service.getStockQuote("RELIANCE")).resolves.toMatchObject({
      symbol: "RELIANCE.NS",
      price: 2450.5,
    });
    expect(cache.getOrSet).toHaveBeenCalledWith(
      "market:quote:RELIANCE.NS",
      TTL.PRICE_QUOTE,
      expect.any(Function),
    );
  });

  it("rejects empty symbols", async () => {
    const { service } = makeService();

    await expect(service.getStockQuote("   ")).rejects.toThrow(
      "MarketDataService: symbol is required",
    );
  });
});
