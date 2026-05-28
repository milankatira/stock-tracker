import { Inject, Injectable } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { TTL } from "../cache/ttl-policy";

export const MARKET_DATA_PROVIDER = Symbol("MARKET_DATA_PROVIDER");

export interface Quote {
  readonly symbol: string;
  readonly price: number;
  readonly currency: "INR";
  readonly asOf: string;
  readonly source: string;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;
}

@Injectable()
export class MarketDataService {
  constructor(
    private readonly cache: CacheService,
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
  ) {}

  async getStockQuote(symbol: string): Promise<Quote> {
    const normalized = this.normalizeStockSymbol(symbol);
    return this.cache.getOrSet(
      `market:quote:${normalized}`,
      TTL.PRICE_QUOTE,
      () => this.provider.getQuote(normalized),
    );
  }

  normalizeStockSymbol(symbol: string): string {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      throw new Error("MarketDataService: symbol is required");
    }
    if (trimmed.endsWith(".NS") || trimmed.endsWith(".BO")) return trimmed;
    return `${trimmed}.NS`;
  }
}
