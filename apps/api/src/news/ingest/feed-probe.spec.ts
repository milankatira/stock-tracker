import { describe, expect, it, vi } from "vitest";
import { probeFeeds } from "./feed-probe";
import type { FeedEntry } from "./feed-registry";

const REGISTRY: readonly FeedEntry[] = [
  { source: "ok", url: "https://example.com/ok.rss", verified: true },
  { source: "down", url: "https://example.com/dead.rss", verified: false },
];

describe("probeFeeds", () => {
  it("returns ok=true on a 200 response", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      return { ok: true, status: 200 } as Response;
    });
    const outcomes = await probeFeeds(
      [REGISTRY[0]] as FeedEntry[],
      fetchFn as unknown as typeof fetch,
    );
    expect(outcomes[0]).toMatchObject({ source: "ok", ok: true, status: 200 });
  });

  it("returns ok=false on a 404 without throwing", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    const outcomes = await probeFeeds(
      [REGISTRY[1]] as FeedEntry[],
      fetchFn as unknown as typeof fetch,
    );
    expect(outcomes[0]).toMatchObject({ source: "down", ok: false, status: 404 });
  });

  it("swallows fetch rejections and reports them in the outcome", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const outcomes = await probeFeeds(
      [REGISTRY[1]] as FeedEntry[],
      fetchFn as unknown as typeof fetch,
    );
    expect(outcomes[0]).toMatchObject({ ok: false, error: "ENOTFOUND" });
  });
});
