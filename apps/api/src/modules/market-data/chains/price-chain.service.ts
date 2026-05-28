import { Injectable, Logger } from "@nestjs/common";
import type {
  Fundamentals,
  OHLCVBar,
  PriceProvider,
  ProviderResult,
  Quote,
  QuoteSummaryModule,
} from "@finsight/shared";
import { NseAdapter } from "../nse.adapter";
import { YahooAdapter } from "../yahoo.adapter";
import { StaleCacheService } from "../stale-cache/stale-cache.service";
import { CHAIN_STALE_TTL_SECONDS } from "./chain.types";

const SOURCE = "price-chain";

/**
 * Multi-source price provider chain. Tries the primary (Yahoo), then the
 * supplement (NSE — quote only), then a last-resort read from the Redis
 * stale-cache.
 *
 * On a successful fetch the chain writes the value to the stale-cache so
 * the next outage has something to serve. The breaker/timeout
 * machinery already lives inside the individual adapters (Bottleneck +
 * pTimeout) — this chain layer focuses on selection + stale fallback.
 */
@Injectable()
export class PriceChainService implements PriceProvider {
  private readonly logger = new Logger(PriceChainService.name);

  constructor(
    private readonly yahoo: YahooAdapter,
    private readonly nse: NseAdapter,
    private readonly staleCache: StaleCacheService,
  ) {}

  async getLatestQuote(
    yahooSymbol: string,
  ): Promise<ProviderResult<Quote>> {
    const cacheKey = `quote:${yahooSymbol}`;

    const yahooResult = await this.runAdapter("yahoo.quote", () =>
      this.yahoo.getLatestQuote(yahooSymbol),
    );
    if (yahooResult?.status === "ok") {
      await this.writeStale(cacheKey, yahooResult.data, CHAIN_STALE_TTL_SECONDS.PRICE_QUOTE);
      return yahooResult;
    }

    const nseResult = await this.runAdapter("nse.quote", () =>
      this.nse.getLatestQuote(yahooSymbol),
    );
    if (nseResult?.status === "ok") {
      await this.writeStale(cacheKey, nseResult.data, CHAIN_STALE_TTL_SECONDS.PRICE_QUOTE);
      return nseResult;
    }

    return this.readStale<Quote>(cacheKey, "stock-nse-india");
  }

  async getDailyHistory(
    yahooSymbol: string,
    from: Date,
    to: Date,
  ): Promise<ProviderResult<OHLCVBar[]>> {
    const cacheKey = `history:${yahooSymbol}:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
    const result = await this.runAdapter("yahoo.history", () =>
      this.yahoo.getDailyHistory(yahooSymbol, from, to),
    );
    if (result?.status === "ok") {
      await this.writeStale(cacheKey, result.data, CHAIN_STALE_TTL_SECONDS.PRICE_HISTORY);
      return result;
    }
    return this.readStale<OHLCVBar[]>(cacheKey, "yahoo-finance2");
  }

  async getFundamentals(
    yahooSymbol: string,
    modules: readonly QuoteSummaryModule[],
  ): Promise<ProviderResult<Fundamentals>> {
    const cacheKey = `fundamentals:${yahooSymbol}:${[...modules].sort().join(",")}`;
    const result = await this.runAdapter("yahoo.fundamentals", () =>
      this.yahoo.getFundamentals(yahooSymbol, modules),
    );
    if (result?.status === "ok") {
      await this.writeStale(cacheKey, result.data, CHAIN_STALE_TTL_SECONDS.FUNDAMENTALS);
      return result;
    }
    return this.readStale<Fundamentals>(cacheKey, "yahoo-finance2");
  }

  private async runAdapter<T>(
    label: string,
    fn: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T> | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        { breaker: label, message: this.errorMessage(err) },
        "price_chain_adapter_threw",
      );
      return null;
    }
  }

  private async writeStale<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.staleCache.write(key, value, ttlSeconds);
    } catch (err) {
      this.logger.warn(
        { key, message: this.errorMessage(err) },
        "price_chain_stale_write_failed",
      );
    }
  }

  private async readStale<T>(
    key: string,
    source: string,
  ): Promise<ProviderResult<T>> {
    const cached = await this.staleCache.read<T>(key);
    if (cached) {
      return {
        status: "stale",
        source,
        fetchedAt: new Date(),
        stalenessSeconds: cached.stalenessSeconds,
        data: cached.value,
      };
    }
    return {
      status: "err",
      reason: "unknown",
      message: "all providers failed and stale-cache miss",
      source: SOURCE,
    };
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "unknown chain error";
  }
}
