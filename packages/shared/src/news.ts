/**
 * Shared news-feed contract (NEWS-02). Returned by the API
 * `GET /stocks/:ticker/news` endpoint and consumed by the web
 * `<NewsFeed />` component, so both sides agree on the shape.
 *
 * Named `NewsFeedItem` (not `NewsItem`) to avoid colliding with the
 * ingestion-side `NewsItem` exported from `providers/news-provider.port`.
 */
export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface NewsFeedItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  /** ISO 8601 timestamp. */
  readonly publishedAt: string;
  /** `null` until the embed-classify pipeline tags the article. */
  readonly sentiment: SentimentLabel | null;
}
