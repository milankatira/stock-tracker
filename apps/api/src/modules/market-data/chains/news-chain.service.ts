import { Injectable, Logger } from "@nestjs/common";
import type {
  NewsItem,
  NewsProvider,
  ProviderResult,
} from "@finsight/shared";
import { NewsDataIoAdapter } from "../newsdata-io.adapter";
import { RssNewsAdapter } from "../rss-news.adapter";
import { StaleCacheService } from "../stale-cache/stale-cache.service";
import { CHAIN_STALE_TTL_SECONDS } from "./chain.types";

const SOURCE = "news-chain";

@Injectable()
export class NewsChainService implements NewsProvider {
  private readonly logger = new Logger(NewsChainService.name);

  constructor(
    private readonly rss: RssNewsAdapter,
    private readonly newsDataIo: NewsDataIoAdapter,
    private readonly staleCache: StaleCacheService,
  ) {}

  async getRecent(since: Date): Promise<ProviderResult<NewsItem[]>> {
    const cacheKey = `news:${since.toISOString()}`;
    const rssResult = await this.runAdapter("rss.recent", () =>
      this.rss.getRecent(since),
    );
    if (rssResult?.status === "ok" && rssResult.data.length > 0) {
      await this.writeStale(cacheKey, rssResult.data, CHAIN_STALE_TTL_SECONDS.NEWS_RECENT);
      return rssResult;
    }

    const newsdataResult = await this.runAdapter("newsdata.recent", () =>
      this.newsDataIo.getRecent(since),
    );
    if (newsdataResult?.status === "ok") {
      const items = [
        ...(rssResult?.status === "ok" ? rssResult.data : []),
        ...newsdataResult.data,
      ];
      await this.writeStale(cacheKey, items, CHAIN_STALE_TTL_SECONDS.NEWS_RECENT);
      return {
        status: "ok",
        source: "news-chain",
        fetchedAt: new Date(),
        data: items,
      };
    }

    if (rssResult?.status === "ok") {
      return rssResult;
    }

    return this.readStale<NewsItem[]>(cacheKey, "rss-news");
  }

  private async runAdapter<T>(
    label: string,
    fn: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T> | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        { adapter: label, message: this.errorMessage(err) },
        "news_chain_adapter_threw",
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
        "news_chain_stale_write_failed",
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
