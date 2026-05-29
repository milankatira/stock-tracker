export interface FeedEntry {
  readonly source: string;
  readonly url: string;
  /** `true` when 06-RESEARCH §Verified RSS Feed Inventory confirmed the URL. */
  readonly verified: boolean;
}

/**
 * Single source of truth for RSS feed URLs. Adapters must consume from
 * this list — no ad-hoc URLs in code. Unverified entries are still
 * polled but flagged in logs; `feed-probe.ts` will surface 4xx/5xx at
 * boot so a dead feed never silently degrades coverage.
 *
 * BSE/NSE corporate-announcement feeds are excluded from v1 per
 * Open Question 4 (06-RESEARCH).
 */
export const FEED_REGISTRY: readonly FeedEntry[] = [
  // Economic Times — verified
  {
    source: "et-markets",
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    verified: true,
  },
  {
    source: "et-stocks",
    url: "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
    verified: true,
  },
  {
    source: "et-mutual-funds",
    url: "https://economictimes.indiatimes.com/mutual-funds/rssfeeds/9442176.cms",
    verified: true,
  },
  {
    source: "et-ipo",
    url: "https://economictimes.indiatimes.com/markets/ipo/rssfeeds/14820509.cms",
    verified: true,
  },
  // MoneyControl — unverified (URLs from research, live-probed at boot)
  {
    source: "moneycontrol-business",
    url: "https://www.moneycontrol.com/rss/business.xml",
    verified: false,
  },
  {
    source: "moneycontrol-markets",
    url: "https://www.moneycontrol.com/rss/marketreports.xml",
    verified: false,
  },
  // LiveMint — unverified
  {
    source: "livemint-markets",
    url: "https://www.livemint.com/rss/markets",
    verified: false,
  },
  // Business Standard — unverified
  {
    source: "business-standard-markets",
    url: "https://www.business-standard.com/rss/markets-106.rss",
    verified: false,
  },
];
