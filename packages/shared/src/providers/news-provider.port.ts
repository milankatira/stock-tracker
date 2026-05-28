import type { ProviderResult } from "./provider-result";

export interface NewsItem {
  /** Stable dedup key (URL or RSS guid). */
  readonly guid: string;
  readonly url: string;
  readonly title: string;
  /** Provider identifier — e.g. "moneycontrol", "et", "newsdata.io". */
  readonly source: string;
  readonly publishedAt: Date;
  readonly body?: string;
  readonly tickersMentioned?: readonly string[];
}

/**
 * News adapter is a dumb fetcher — it returns recent items from this
 * provider regardless of instrument. Tagging news items to instruments is
 * domain logic (Plan 02-03 TickerTaggerService), kept off the adapter.
 */
export interface NewsProvider {
  getRecent(since: Date): Promise<ProviderResult<NewsItem[]>>;
}

export const NEWS_PROVIDER = Symbol("NEWS_PROVIDER");
