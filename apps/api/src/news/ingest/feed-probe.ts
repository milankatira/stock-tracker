import { Logger } from "@nestjs/common";
import type { FeedEntry } from "./feed-registry";

export interface FeedProbeOutcome {
  readonly source: string;
  readonly url: string;
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Boot-time fetch against each registered RSS URL. Logs ERROR on any
 * 4xx/5xx so dead feeds surface immediately, but NEVER throws — the
 * API must come up even when MoneyControl is down. Tests inject a
 * `fetchFn` to drive the probe deterministically.
 */
export async function probeFeeds(
  registry: readonly FeedEntry[],
  fetchFn: typeof fetch = fetch,
): Promise<readonly FeedProbeOutcome[]> {
  const logger = new Logger("FeedProbe");
  const outcomes = await Promise.all(
    registry.map(async (entry) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        const res = await fetchFn(entry.url, {
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          logger.log(
            { source: entry.source, url: entry.url, status: res.status },
            "news_feed_probe_ok",
          );
          return { source: entry.source, url: entry.url, ok: true, status: res.status };
        }
        logger.warn(
          { source: entry.source, url: entry.url, status: res.status },
          "news_feed_probe_non_2xx",
        );
        return {
          source: entry.source,
          url: entry.url,
          ok: false,
          status: res.status,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        logger.warn(
          { source: entry.source, url: entry.url, message },
          "news_feed_probe_error",
        );
        return {
          source: entry.source,
          url: entry.url,
          ok: false,
          error: message,
        };
      }
    }),
  );
  return outcomes;
}
