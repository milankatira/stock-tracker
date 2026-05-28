import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  NARRATIVE_BATCH_JOB_NAME,
  NARRATIVE_BATCH_QUEUE_NAME,
  type NarrativeBatchJobData,
} from "./narrative-batch.types";

/**
 * Producer surface for the `narrative-batch` queue. `enqueueForTicker`
 * uses a deterministic `jobId = narrative:${ticker}:${dataVersionHash}`
 * so a re-enqueue for the same instrument + same data version is a
 * BullMQ no-op (versioned idempotency).
 */
@Injectable()
export class NarrativeBatchQueue {
  constructor(
    @InjectQueue(NARRATIVE_BATCH_QUEUE_NAME)
    private readonly queue: Queue<NarrativeBatchJobData>,
  ) {}

  async enqueueForTicker(
    ticker: string,
    dataVersionHash: string,
    triggeredBy = "cron",
  ): Promise<string> {
    const jobId = `narrative:${ticker}:${dataVersionHash}`;
    const job = await this.queue.add(
      NARRATIVE_BATCH_JOB_NAME,
      { ticker, dataVersionHash, triggeredBy },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    );
    return job.id ?? jobId;
  }

  async enqueueBatch(
    items: ReadonlyArray<{ ticker: string; dataVersionHash: string }>,
    triggeredBy = "cron",
  ): Promise<readonly string[]> {
    return Promise.all(
      items.map((item) =>
        this.enqueueForTicker(item.ticker, item.dataVersionHash, triggeredBy),
      ),
    );
  }
}
