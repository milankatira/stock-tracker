import type { NewsFeedItem } from "@finsight/shared";
import { SentimentBadge } from "./SentimentBadge";
import { RelativeTime } from "./RelativeTime";

interface NewsFeedProps {
  readonly items: readonly NewsFeedItem[];
}

function NewsItemRow({ item }: { item: NewsFeedItem }) {
  return (
    <li className="py-3 transition-colors hover:bg-muted/50">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start justify-between gap-3 px-1"
      >
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-medium leading-snug">
            {item.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {item.source} · <RelativeTime iso={item.publishedAt} />
          </span>
        </span>
        <SentimentBadge sentiment={item.sentiment} />
      </a>
    </li>
  );
}

/**
 * Recent-news feed for a stock report (NEWS-01/02). Presentational: the
 * page fetches the items and passes them in. Titles render as plain text
 * (React escapes — no `dangerouslySetInnerHTML`); every external link
 * carries `target="_blank" rel="noopener noreferrer"` (reverse-tabnabbing
 * + XSS mitigations). Empty tickers show a graceful empty state.
 */
export function NewsFeed({ items }: NewsFeedProps) {
  return (
    <section aria-label="Recent news" className="space-y-3">
      <h2 className="text-lg font-semibold">Recent News</h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No recent news for this stock.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <NewsItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Sentiment tags are AI analysis, not investment advice. Past performance
        is not indicative of future results.
      </p>
    </section>
  );
}
