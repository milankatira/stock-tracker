import { describe, expect, it, vi } from "vitest";
import { getRecentNewsTool } from "../get-recent-news.tool";
import { makeCtx } from "./_fixtures";

const { handler } = getRecentNewsTool;

function newsDoc(over: Partial<{ sentiment: string | null; publishedAt: string }> = {}) {
  return {
    id: "n1",
    title: "Reliance posts record quarter",
    url: "https://example.com/r1",
    source: "moneycontrol",
    publishedAt: over.publishedAt ?? new Date().toISOString(),
    sentiment: over.sentiment === undefined ? "POSITIVE" : over.sentiment,
  };
}

describe("getRecentNews tool", () => {
  it("projects {title, sentiment, url, publishedAt} and tags the sourceTag with the window", async () => {
    const ctx = makeCtx({
      news: { getRecentForTicker: vi.fn().mockResolvedValue([newsDoc()]) },
    });
    const res = await handler({ symbol: "RELIANCE" }, ctx);
    expect(res.data).toHaveLength(1);
    expect(Object.keys(res.data[0]!).sort()).toEqual(
      ["publishedAt", "sentiment", "title", "url"].sort(),
    );
    expect(res.sourceTag).toBe("news:RELIANCE:7d");
  });

  it("defaults a null sentiment to NEUTRAL (graceful, no crash)", async () => {
    const ctx = makeCtx({
      news: { getRecentForTicker: vi.fn().mockResolvedValue([newsDoc({ sentiment: null })]) },
    });
    const res = await handler({ symbol: "RELIANCE" }, ctx);
    expect(res.data[0]!.sentiment).toBe("NEUTRAL");
  });

  it("filters out articles older than sinceDays", async () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ctx = makeCtx({
      news: {
        getRecentForTicker: vi
          .fn()
          .mockResolvedValue([newsDoc(), newsDoc({ publishedAt: old })]),
      },
    });
    const res = await handler({ symbol: "RELIANCE", sinceDays: 7 }, ctx);
    expect(res.data).toHaveLength(1);
    expect(res.sourceTag).toBe("news:RELIANCE:7d");
  });

  it("returns an empty list (not an error) when there is no news", async () => {
    const res = await handler({ symbol: "RELIANCE" }, makeCtx());
    expect(res.data).toEqual([]);
  });
});
