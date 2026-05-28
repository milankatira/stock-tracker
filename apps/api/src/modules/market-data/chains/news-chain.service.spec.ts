import { describe, expect, it, vi } from "vitest";
import type { NewsItem, ProviderResult } from "@finsight/shared";
import type { NewsDataIoAdapter } from "../newsdata-io.adapter";
import type { RssNewsAdapter } from "../rss-news.adapter";
import type { StaleCacheService } from "../stale-cache/stale-cache.service";
import { NewsChainService } from "./news-chain.service";

const baseItem: NewsItem = {
  guid: "g-1",
  url: "https://example.com/n",
  title: "Headline",
  source: "moneycontrol",
  publishedAt: new Date("2026-05-27T08:30:00.000Z"),
};

function okResult(items: readonly NewsItem[], source: string): ProviderResult<NewsItem[]> {
  return {
    status: "ok",
    source,
    fetchedAt: new Date(),
    data: [...items],
  };
}

function errResult(reason: ProviderResult<NewsItem[]> extends infer R ? R extends { status: "err"; reason: infer P } ? P : never : never): ProviderResult<NewsItem[]> {
  return {
    status: "err",
    reason,
    message: "",
    source: "rss-news",
  } as ProviderResult<NewsItem[]>;
}

function makeStale(): StaleCacheService & {
  write: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  } as unknown as StaleCacheService & {
    write: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
}

describe("NewsChainService.getRecent", () => {
  it("returns ok with RSS items when RSS has items", async () => {
    const rss = {
      getRecent: vi.fn().mockResolvedValue(okResult([baseItem], "rss-news")),
    } as unknown as RssNewsAdapter;
    const nd = {
      getRecent: vi.fn().mockResolvedValue(errResult("rate-limited")),
    } as unknown as NewsDataIoAdapter;
    const stale = makeStale();
    const chain = new NewsChainService(rss, nd, stale as unknown as StaleCacheService);

    const result = await chain.getRecent(new Date(0));

    expect(result).toMatchObject({ status: "ok", source: "rss-news" });
    expect(nd.getRecent).not.toHaveBeenCalled();
    expect(stale.write).toHaveBeenCalledOnce();
  });

  it("merges RSS + NewsData.io items when both produce content", async () => {
    const rss = {
      getRecent: vi.fn().mockResolvedValue(okResult([], "rss-news")),
    } as unknown as RssNewsAdapter;
    const nd = {
      getRecent: vi
        .fn()
        .mockResolvedValue(okResult([baseItem], "newsdata.io")),
    } as unknown as NewsDataIoAdapter;
    const stale = makeStale();
    const chain = new NewsChainService(rss, nd, stale as unknown as StaleCacheService);

    const result = await chain.getRecent(new Date(0));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(1);
    expect(result.source).toBe("news-chain");
  });

  it("serves stale-cache when both adapters fail", async () => {
    const rss = {
      getRecent: vi.fn().mockResolvedValue(errResult("validation")),
    } as unknown as RssNewsAdapter;
    const nd = {
      getRecent: vi.fn().mockResolvedValue(errResult("rate-limited")),
    } as unknown as NewsDataIoAdapter;
    const stale = makeStale();
    stale.read.mockResolvedValueOnce({
      value: [baseItem],
      stalenessSeconds: 240,
    });
    const chain = new NewsChainService(rss, nd, stale as unknown as StaleCacheService);

    const result = await chain.getRecent(new Date(0));

    expect(result.status).toBe("stale");
    if (result.status !== "stale") return;
    expect(result.stalenessSeconds).toBe(240);
  });
});
