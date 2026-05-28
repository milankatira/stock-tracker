import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { formatInTimeZone } from "date-fns-tz";
import { Types } from "mongoose";
import { scoreFund, scoreStock } from "../../scoring";
import { EodRecomputeProducer } from "./eod-recompute.producer";
import {
  EOD_CHILD_JOB_NAME,
  EOD_PARENT_JOB_NAME,
  EOD_QUEUE_NAME,
  type EodChildPayload,
  type EodParentPayload,
} from "./eod-recompute.types";
import { RedisScoreMaterialiser } from "./redis-score-materialiser";
import { ScoreHistoryRepository } from "./score-history.repository";
import { ScoringEngineVersionProvider } from "./scoring-engine-version.provider";
import { FundsScoreLoader, StocksScoreLoader } from "./score-loaders";

/**
 * EOD recompute worker. Parent job → recompute the active universe.
 * Child job → load `ScoreInput`, call `scoreStock`/`scoreFund`, write
 * to `score_history` (Mongo time-series), then mirror into Redis.
 *
 * Ordering is intentional: Mongo write FIRST so the durable history
 * is canonical. If Mongo succeeds but Redis fails, BullMQ retries; the
 * idempotent jobId prevents double-counting at the producer level,
 * and `score_history.findLatest()` naturally resolves any stray
 * duplicates.
 */
@Processor(EOD_QUEUE_NAME, { concurrency: 10 })
export class EodRecomputeProcessor extends WorkerHost {
  private readonly logger = new Logger(EodRecomputeProcessor.name);

  constructor(
    private readonly stocksLoader: StocksScoreLoader,
    private readonly fundsLoader: FundsScoreLoader,
    private readonly history: ScoreHistoryRepository,
    private readonly redis: RedisScoreMaterialiser,
    private readonly version: ScoringEngineVersionProvider,
    private readonly producer: EodRecomputeProducer,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === EOD_PARENT_JOB_NAME) {
      return this.processParent(job);
    }
    if (job.name === EOD_CHILD_JOB_NAME) {
      return this.processChild(job);
    }
    this.logger.warn({ jobName: job.name }, "eod_recompute_unknown_job_name");
    return null;
  }

  private async processParent(job: Job): Promise<{ enqueued: number; chunks: number }> {
    const payload = (job.data ?? {}) as EodParentPayload;
    const asOfDate =
      payload.asOfDate ??
      formatInTimeZone(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
    const triggeredBy = payload.triggeredBy ?? "cron";
    this.logger.log(
      { asOfDate, triggeredBy },
      "eod_recompute_parent_dispatch",
    );
    return this.producer.fanOut(asOfDate, triggeredBy);
  }

  private async processChild(job: Job): Promise<void> {
    const payload = job.data as EodChildPayload;
    const computedAt = new Date();
    try {
      const scoring =
        payload.instrumentType === "STOCK"
          ? scoreStock(
              await this.stocksLoader.loadScoreInput(
                payload.instrumentId,
                payload.asOfDate,
              ),
            )
          : scoreFund(
              await this.fundsLoader.loadScoreInput(
                payload.instrumentId,
                payload.asOfDate,
              ),
            );

      await this.history.insert({
        instrumentId: new Types.ObjectId(payload.instrumentId),
        instrumentType: payload.instrumentType,
        asOfDate: payload.asOfDate,
        computedAt,
        score: scoring.score,
        verdict: scoring.verdict,
        pillars: scoring.pillars,
        scoringEngineVersion: this.version.current(),
      });

      await this.redis.writeScore(payload.instrumentId, {
        score: scoring.score,
        verdict: scoring.verdict,
        asOfDate: payload.asOfDate,
        computedAt: computedAt.toISOString(),
        scoringEngineVersion: this.version.current(),
      });
    } catch (err) {
      this.logger.error(
        {
          instrumentId: payload.instrumentId,
          instrumentType: payload.instrumentType,
          asOfDate: payload.asOfDate,
          triggeredBy: payload.triggeredBy,
          message: err instanceof Error ? err.message : "unknown",
        },
        "eod_recompute_child_failed",
      );
      throw err;
    }
  }
}
