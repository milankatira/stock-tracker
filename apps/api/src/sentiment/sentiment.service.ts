import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { CacheService } from "../modules/cache/cache.service";
import { NewsRepository } from "../news/news.repository";
import { EodRecomputeProducer } from "../jobs/eod-recompute/eod-recompute.producer";
import {
  NEWS_CLASSIFIED_EVENT,
  type NewsClassifiedEvent,
} from "../jobs/news-embed-classify/embed-classify.queue";
import { aggregateSentimentPillar } from "./aggregator";
import {
  pillarCacheKey,
  shouldTriggerRecompute,
  toScoreStockSentiment,
  toSentimentItem,
} from "./pillar-publisher";
import { SENTIMENT_LOOKBACK_DAYS, type PillarResult } from "./sentiment.types";
import type { ScoreStockSentiment } from "../scoring";

/** 36h — comfortably longer than the 24h between EOD runs (project TTL rule). */
const PILLAR_CACHE_TTL_SECONDS = 36 * 3_600;

/**
 * Sentiment-pillar feedback into scoring (NEWS-04). Listens for
 * `news.classified`, recomputes the recency/authority-weighted pillar
 * for every mentioned instrument, caches it, and fires a selective
 * `eod-recompute` when the shift is material (>= RECOMPUTE_THRESHOLD).
 *
 * The pure scoring engine already consumes
 * `ScoreStockInput.sentiment.last30dAggregate`; `computePillar()`
 * produces exactly that shape so the (currently stubbed) Phase-2↔3
 * score loader can adopt it with a one-line change. See `score-loaders.ts`.
 */
@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);

  constructor(
    private readonly news: NewsRepository,
    private readonly cache: CacheService,
    private readonly recompute: EodRecomputeProducer,
  ) {}

  /**
   * Compute the sentiment pillar for an instrument from the last
   * `SENTIMENT_LOOKBACK_DAYS` of classified news. Returns the scoring
   * contract directly: `ScoreStockSentiment | null` (null → neutral
   * fallback in the scoring engine).
   */
  async computePillar(
    instrumentId: string,
    asOf: Date = new Date(),
  ): Promise<{ sentiment: ScoreStockSentiment | null; result: PillarResult }> {
    const docs = await this.news.findRecentClassifiedForInstrument(
      instrumentId,
      SENTIMENT_LOOKBACK_DAYS,
    );
    const items = docs
      .filter((d) => d.sentiment != null)
      .map((d) =>
        toSentimentItem({
          source: d.source,
          sentiment: d.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
          sentimentConfidence: d.sentimentConfidence,
          publishedAt: d.publishedAt,
        }),
      );
    const value = aggregateSentimentPillar(items, asOf);
    return {
      sentiment: toScoreStockSentiment(value),
      result: {
        value,
        coverage: { itemCount: items.length, lookbackDays: SENTIMENT_LOOKBACK_DAYS },
      },
    };
  }

  /**
   * Recompute + cache the pillar and, when the shift is material, enqueue
   * a selective stock recompute. Idempotent and safe to call repeatedly.
   */
  async refreshPillar(instrumentId: string, asOf: Date = new Date()): Promise<PillarResult> {
    const { result } = await this.computePillar(instrumentId, asOf);
    const prev = await this.cache.get<number>(pillarCacheKey(instrumentId));

    if (shouldTriggerRecompute(prev, result.value)) {
      const asOfDate = asOf.toISOString().slice(0, 10);
      await this.recompute.enqueueInstrument(
        instrumentId,
        "STOCK",
        asOfDate,
        `sentiment:${instrumentId}`,
      );
      this.logger.log(
        { instrumentId, prev, next: result.value },
        "sentiment_pillar_recompute_triggered",
      );
    }

    if (result.value !== null) {
      await this.cache.set(
        pillarCacheKey(instrumentId),
        result.value,
        PILLAR_CACHE_TTL_SECONDS,
      );
    }
    return result;
  }

  /** Listener: a freshly-classified article refreshes every mentioned instrument's pillar. */
  @OnEvent(NEWS_CLASSIFIED_EVENT)
  async onArticleClassified(event: NewsClassifiedEvent): Promise<void> {
    for (const instrumentId of event.instrumentMentions) {
      try {
        await this.refreshPillar(instrumentId);
      } catch (err) {
        // One bad instrument must not poison the rest of the batch.
        this.logger.error(
          { instrumentId, message: err instanceof Error ? err.message : "unknown" },
          "sentiment_pillar_refresh_failed",
        );
      }
    }
  }
}
