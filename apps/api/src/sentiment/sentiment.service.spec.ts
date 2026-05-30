import { beforeEach, describe, expect, it, vi } from "vitest";
import { SentimentService } from "./sentiment.service";
import { pillarCacheKey } from "./pillar-publisher";
import type { NewsRepository } from "../news/news.repository";
import type { CacheService } from "../modules/cache/cache.service";
import type { EodRecomputeProducer } from "../jobs/eod-recompute/eod-recompute.producer";

const ASOF = new Date("2026-05-29T12:00:00.000Z");

function classifiedDoc(sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL") {
  return {
    source: "moneycontrol",
    sentiment,
    sentimentConfidence: 1,
    publishedAt: new Date(ASOF.getTime() - 60 * 60 * 1000),
  };
}

describe("SentimentService", () => {
  let news: NewsRepository;
  let cache: CacheService;
  let recompute: EodRecomputeProducer;
  let service: SentimentService;

  beforeEach(() => {
    news = {
      findRecentClassifiedForInstrument: vi.fn().mockResolvedValue([]),
    } as unknown as NewsRepository;
    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as CacheService;
    recompute = {
      enqueueInstrument: vi.fn().mockResolvedValue(undefined),
    } as unknown as EodRecomputeProducer;
    service = new SentimentService(news, cache, recompute);
  });

  describe("computePillar", () => {
    it("returns null sentiment when there is no classified news", async () => {
      const { sentiment, result } = await service.computePillar("INFY", ASOF);
      expect(sentiment).toBeNull();
      expect(result.value).toBeNull();
      expect(result.coverage).toEqual({ itemCount: 0, lookbackDays: 30 });
    });

    it("maps a positive news set onto last30dAggregate > 5", async () => {
      (news.findRecentClassifiedForInstrument as ReturnType<typeof vi.fn>).mockResolvedValue([
        classifiedDoc("POSITIVE"),
        classifiedDoc("POSITIVE"),
        classifiedDoc("POSITIVE"),
      ]);
      const { sentiment } = await service.computePillar("INFY", ASOF);
      expect(sentiment).not.toBeNull();
      expect(sentiment!.last30dAggregate!).toBeGreaterThan(5);
      expect(sentiment!.analystConsensus).toBeNull();
    });
  });

  describe("refreshPillar", () => {
    it("enqueues a recompute and caches when the value is new (no prior)", async () => {
      (news.findRecentClassifiedForInstrument as ReturnType<typeof vi.fn>).mockResolvedValue([
        classifiedDoc("POSITIVE"),
      ]);
      await service.refreshPillar("INFY", ASOF);

      expect(recompute.enqueueInstrument).toHaveBeenCalledWith(
        "INFY",
        "STOCK",
        "2026-05-29",
        "sentiment:INFY",
      );
      expect(cache.set).toHaveBeenCalledWith(pillarCacheKey("INFY"), expect.any(Number), 36 * 3600);
    });

    it("does NOT enqueue when the shift is below threshold", async () => {
      (news.findRecentClassifiedForInstrument as ReturnType<typeof vi.fn>).mockResolvedValue([
        classifiedDoc("NEUTRAL"),
      ]);
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(5.0); // prior ~ equal to neutral
      await service.refreshPillar("INFY", ASOF);

      expect(recompute.enqueueInstrument).not.toHaveBeenCalled();
    });

    it("does not cache or enqueue when there is no news (null value)", async () => {
      await service.refreshPillar("INFY", ASOF);
      expect(recompute.enqueueInstrument).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe("onArticleClassified", () => {
    it("refreshes every mentioned instrument and survives one failing instrument", async () => {
      const spy = vi
        .spyOn(service, "refreshPillar")
        .mockImplementationOnce(() => Promise.reject(new Error("boom")))
        .mockResolvedValue({ value: 6, coverage: { itemCount: 1, lookbackDays: 30 } });

      await service.onArticleClassified({
        newsId: "n1",
        instrumentMentions: ["BADID", "INFY"],
      });

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
