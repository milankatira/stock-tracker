import { describe, expect, it, vi } from "vitest";
import { RssNewsAdapter, type RssFeedSource } from "./rss-news.adapter";
import rssFixture from "../../../test/fixtures/rss-moneycontrol-sample.json";

const moneycontrolFeed: RssFeedSource = {
  source: "moneycontrol-markets",
  url: "https://www.moneycontrol.com/rss/marketreports.xml",
};
const etFeed: RssFeedSource = {
  source: "economictimes-markets",
  url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
};

function makeFetcher() {
  return {
    parseURL: vi.fn<(url: string) => Promise<{ items?: unknown[] }>>(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("RssNewsAdapter.getRecent", () => {
  it("returns ok with NewsItem[] mapped from rss-parser output for items newer than since", async () => {
    const fetcher = makeFetcher();
    fetcher.parseURL.mockResolvedValueOnce(clone(rssFixture));
    const adapter = new RssNewsAdapter(fetcher, [moneycontrolFeed]);

    const since = new Date("2026-05-23T00:00:00.000Z");
    const result = await adapter.getRecent(since);

    expect(fetcher.parseURL).toHaveBeenCalledWith(moneycontrolFeed.url);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(2);
    expect(result.data.every((item) => item.publishedAt > since)).toBe(true);
    expect(result.data[0]).toMatchObject({
      source: moneycontrolFeed.source,
      title: expect.stringContaining("Reliance"),
    });
  });

  it("dedupes by guid across feeds and within repeat calls", async () => {
    const fetcher = makeFetcher();
    fetcher.parseURL.mockResolvedValue(clone(rssFixture));
    const adapter = new RssNewsAdapter(fetcher, [moneycontrolFeed, etFeed]);

    const since = new Date("2026-05-23T00:00:00.000Z");
    const first = await adapter.getRecent(since);
    const second = await adapter.getRecent(since);

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (first.status !== "ok" || second.status !== "ok") return;
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(0);
  });

  it("returns ok with [] when every feed throws — never aborts the batch", async () => {
    const fetcher = makeFetcher();
    fetcher.parseURL.mockRejectedValue(new Error("feed timed out"));
    const adapter = new RssNewsAdapter(fetcher, [moneycontrolFeed, etFeed]);

    const result = await adapter.getRecent(new Date(0));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual([]);
    expect(fetcher.parseURL).toHaveBeenCalledTimes(2);
  });

  it("falls back to current time when neither pubDate nor isoDate is parseable", async () => {
    const fetcher = makeFetcher();
    fetcher.parseURL.mockResolvedValueOnce({
      items: [
        {
          link: "https://www.moneycontrol.com/news/x",
          title: "No timestamp",
          guid: "x-no-ts",
        },
      ],
    });
    const adapter = new RssNewsAdapter(fetcher, [moneycontrolFeed]);

    const result = await adapter.getRecent(new Date("2026-01-01T00:00:00.000Z"));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].publishedAt).toBeInstanceOf(Date);
  });

  it("returns a validation err when an item is missing the required title", async () => {
    const fetcher = makeFetcher();
    fetcher.parseURL.mockResolvedValueOnce({
      items: [{ link: "https://www.moneycontrol.com/news/y" }],
    });
    const adapter = new RssNewsAdapter(fetcher, [moneycontrolFeed]);

    const result = await adapter.getRecent(new Date(0));

    expect(result).toMatchObject({
      status: "err",
      reason: "validation",
      source: "rss-news",
    });
  });
});
