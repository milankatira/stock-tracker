export const NEWS_POLL_QUEUE_NAME = "news-poll" as const;
export const NEWS_POLL_TICK_JOB = "news-poll:tick" as const;
export const NEWS_INGEST_SOURCE_JOB = "ingest-source" as const;
export const NEWS_PROCESS_ARTICLE_JOB = "process-article" as const;

export interface IngestSourceJobData {
  readonly source: string;
  readonly url: string;
}

export interface ProcessArticleJobData {
  readonly source: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  readonly publishedAt: string;
}

/**
 * Repeat pattern for the parent tick — every 30 minutes during
 * configured hours. The processor itself enforces the market-hours
 * guard via `NEWS_POLL_MARKET_HOURS_ONLY` so the schedule is simple.
 */
export const NEWS_POLL_REPEAT_PATTERN = "*/30 * * * *" as const;
