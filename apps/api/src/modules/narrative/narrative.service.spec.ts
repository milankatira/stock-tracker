import { describe, expect, it, vi } from "vitest";
import { VERDICTS, type ScoreResult } from "@finsight/shared";
import { TTL } from "../cache/ttl-policy";
import type { CacheService } from "../cache/cache.service";
import { NarrativeService, type NarrativeClient } from "./narrative.service";

const score: ScoreResult = {
  score: 7,
  verdict: VERDICTS.STRONG_SCORE,
  insightCards: [
    { label: "Valuation", score: 72, weight: 0.2 },
    { label: "Growth", score: 68, weight: 0.2 },
  ],
};

function makeService(clientText = "Plain English narrative"): {
  service: NarrativeService;
  cache: CacheService;
  client: NarrativeClient;
} {
  const cache = {
    getOrSet: vi.fn(async (_key: string, _ttl: number, producer: () => Promise<string>) =>
      producer(),
    ),
  } as unknown as CacheService;
  const client = {
    generate: vi.fn(async () => clientText),
  } satisfies NarrativeClient;
  return { service: new NarrativeService(cache, client), cache, client };
}

describe("NarrativeService", () => {
  it("builds a prompt that treats score and verdict as immutable inputs", () => {
    const { service } = makeService();

    const prompt = service.buildPrompt({
      assetName: "Reliance Industries",
      assetType: "stock",
      score,
      citations: ["Yahoo Finance quote", "Company filings"],
    });

    expect(prompt).toContain("score: 7/10");
    expect(prompt).toContain("verdict: STRONG_SCORE");
    expect(prompt).toContain("Do not change or invent numeric metrics");
    expect(prompt).toContain("Yahoo Finance quote");
  });

  it("caches generated narratives with the Gemini narrative TTL", async () => {
    const { service, cache, client } = makeService();

    await expect(
      service.getNarrative({
        assetName: "Reliance Industries",
        assetType: "stock",
        cacheKey: "stock:RELIANCE",
        score,
        citations: ["Yahoo Finance quote"],
      }),
    ).resolves.toBe("Plain English narrative");
    expect(cache.getOrSet).toHaveBeenCalledWith(
      "gemini:narrative:stock:RELIANCE",
      TTL.GEMINI_NARRATIVE,
      expect.any(Function),
    );
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it("rejects empty narrative output", async () => {
    const { service } = makeService("   ");

    await expect(
      service.getNarrative({
        assetName: "Reliance Industries",
        assetType: "stock",
        cacheKey: "stock:RELIANCE",
        score,
        citations: ["Yahoo Finance quote"],
      }),
    ).rejects.toThrow("NarrativeService: empty narrative");
  });
});
