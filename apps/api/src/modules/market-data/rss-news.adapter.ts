import { Injectable, Logger, Optional } from "@nestjs/common";
import Bottleneck from "bottleneck";
import { LRUCache } from "lru-cache";
import pTimeout from "p-timeout";
import Parser from "rss-parser";
import { z } from "zod";
import type {
  NewsItem,
  NewsProvider,
  ProviderResult,
} from "@finsight/shared";
import { rssItemShape } from "./rss-news.schemas";

const SOURCE = "rss-news";
const FEED_TIMEOUT_MS = 5_000;
const LIMITER_OPTS = { maxConcurrent: 2, minTime: 1_000 };
const DEDUP_CACHE_OPTS = {
  max: 5_000,
  ttl: 1_000 * 60 * 60 * 24 * 7,
};

export interface RssFeedSource {
  readonly source: string;
  readonly url: string;
}

export const DEFAULT_RSS_FEEDS: readonly RssFeedSource[] = [
  {
    source: "moneycontrol-markets",
    url: "https://www.moneycontrol.com/rss/marketreports.xml",
  },
  {
    source: "moneycontrol-business",
    url: "https://www.moneycontrol.com/rss/business.xml",
  },
  {
    source: "economictimes-markets",
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  },
];

interface RssFeedFetcher {
  parseURL(url: string): Promise<{ items?: unknown[] }>;
}

/**
 * Dumb news fetcher — pulls items from configured RSS feeds and returns
 * everything with `publishedAt > since`. Tagging items to instruments
 * lives in the Plan 02-03 `TickerTaggerService`; adapters do NOT touch
 * the instrument master.
 *
 * A bad feed (timeout, malformed XML) is logged but never aborts the
 * batch — the other feeds still produce items.
 */
@Injectable()
export class RssNewsAdapter implements NewsProvider {
  private readonly logger = new Logger(RssNewsAdapter.name);
  private readonly limiter = new Bottleneck(LIMITER_OPTS);
  private readonly seenGuids = new LRUCache<string, true>(DEDUP_CACHE_OPTS);
  private readonly feeds: readonly RssFeedSource[];
  private readonly fetcher: RssFeedFetcher;

  constructor(
    @Optional() fetcher?: RssFeedFetcher,
    @Optional() feeds?: readonly RssFeedSource[],
  ) {
    this.fetcher = fetcher ?? new Parser({ timeout: FEED_TIMEOUT_MS });
    this.feeds = feeds ?? DEFAULT_RSS_FEEDS;
  }

  async getRecent(since: Date): Promise<ProviderResult<NewsItem[]>> {
    try {
      const items: NewsItem[] = [];
      for (const feed of this.feeds) {
        const fresh = await this.fetchFeed(feed, since);
        items.push(...fresh);
      }
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: items,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        this.logger.error(
          { provider: SOURCE, issues: err.issues },
          "rss_schema_validation_failed",
        );
        return {
          status: "err",
          reason: "validation",
          message: err.message,
          source: SOURCE,
        };
      }
      throw err;
    }
  }

  private async fetchFeed(
    feed: RssFeedSource,
    since: Date,
  ): Promise<NewsItem[]> {
    let parsed: { items?: unknown[] } | null = null;
    try {
      parsed = await this.limiter.schedule(() =>
        pTimeout(this.fetcher.parseURL(feed.url), {
          milliseconds: FEED_TIMEOUT_MS,
        }),
      );
    } catch (err) {
      this.logger.warn(
        { provider: SOURCE, feed: feed.source, message: this.errorMessage(err) },
        "rss_feed_failed",
      );
      return [];
    }
    if (!parsed?.items) return [];

    const items: NewsItem[] = [];
    for (const rawItem of parsed.items) {
      const validated = rssItemShape.parse(rawItem);
      const guid = validated.guid ?? validated.link;
      if (this.seenGuids.has(guid)) continue;
      this.seenGuids.set(guid, true);

      const publishedAt = this.toPublishedAt(validated);
      if (publishedAt <= since) continue;

      items.push({
        guid,
        url: validated.link,
        title: validated.title,
        source: feed.source,
        publishedAt,
        body: validated.contentSnippet ?? validated.content,
      });
    }
    return items;
  }

  private toPublishedAt(item: { isoDate?: string; pubDate?: string }): Date {
    const candidate = item.isoDate ?? item.pubDate;
    if (!candidate) return new Date();
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return new Date();
    return parsed;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "Unknown RSS error";
  }
}
