import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  FUND_NARRATIVE_BATCH_JOB_NAME,
  FUND_NARRATIVE_BATCH_QUEUE_NAME,
  type FundNarrativeBatchJobData,
} from "./fund-narrative-batch.types";

/**
 * Producer for the `fund-narrative-batch` queue. Mirrors
 * `NarrativeBatchQueue` (stocks) — versioned idempotency key
 * `fund-narrative:${schemeCode}:${dataVersionHash}` so a re-enqueue
 * for the same scheme + data hash is a BullMQ no-op.
 */
@Injectable()
export class FundNarrativeBatchQueue {
  constructor(
    @InjectQueue(FUND_NARRATIVE_BATCH_QUEUE_NAME)
    private readonly queue: Queue<FundNarrativeBatchJobData>,
  ) {}

  async enqueueForFund(
    schemeCode: string,
    dataVersionHash: string,
    triggeredBy = "cron",
  ): Promise<string> {
    const jobId = `fund-narrative:${schemeCode}:${dataVersionHash}`;
    const job = await this.queue.add(
      FUND_NARRATIVE_BATCH_JOB_NAME,
      { schemeCode, dataVersionHash, triggeredBy },
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
}
