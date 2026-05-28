import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ActiveInstrumentProvider } from "./active-instrument.provider";
import {
  EOD_CHILD_JOB_NAME,
  EOD_PARENT_JOB_NAME,
  EOD_QUEUE_NAME,
  EOD_SCHEDULER_KEY,
} from "./eod-recompute.types";

const CHUNK_SIZE = 100;

export interface FanOutResult {
  readonly enqueued: number;
  readonly chunks: number;
}

/**
 * Registers the daily 18:00 IST cron via `Queue.upsertJobScheduler`
 * (idempotent across replicas + restarts) and fans out one child job
 * per active instrument in chunks of 100.
 *
 * `jobId = ${instrumentId}:${asOfDate}` is the cross-replica
 * idempotency key — duplicate enqueues are dropped by BullMQ.
 */
@Injectable()
export class EodRecomputeProducer {
  private readonly logger = new Logger(EodRecomputeProducer.name);

  constructor(
    @InjectQueue(EOD_QUEUE_NAME) private readonly queue: Queue,
    private readonly instruments: ActiveInstrumentProvider,
  ) {}

  /**
   * Called from `OnApplicationBootstrap` once Redis + Mongo are
   * confirmed reachable. Idempotent — re-registers the same scheduler
   * key on every boot, BullMQ deduplicates.
   */
  async registerCron(): Promise<void> {
    // [ASSUMED A11] — cron at 18:00 IST. Push to 20:00 IST if MFAPI NAV publish lags.
    await this.queue.upsertJobScheduler(
      EOD_SCHEDULER_KEY,
      { pattern: "0 18 * * *", tz: "Asia/Kolkata" },
      {
        name: EOD_PARENT_JOB_NAME,
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      },
    );
    this.logger.log({ scheduler: EOD_SCHEDULER_KEY }, "eod_recompute_cron_registered");
  }

  async fanOut(asOfDate: string, triggeredBy = "cron"): Promise<FanOutResult> {
    const universe = await this.instruments.activeUniverse(asOfDate);
    let enqueued = 0;
    let chunks = 0;
    for (const batch of chunk(universe, CHUNK_SIZE)) {
      await this.queue.addBulk(
        batch.map((instrument) => ({
          name: EOD_CHILD_JOB_NAME,
          data: {
            instrumentId: instrument.id,
            instrumentType: instrument.type,
            asOfDate,
            triggeredBy,
          },
          opts: {
            jobId: `${instrument.id}:${asOfDate}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: { count: 500 },
          },
        })),
      );
      enqueued += batch.length;
      chunks += 1;
    }
    this.logger.log(
      { asOfDate, enqueued, chunks, triggeredBy },
      "eod_recompute_fan_out_complete",
    );
    return { enqueued, chunks };
  }
}

function chunk<T>(arr: readonly T[], size: number): readonly (readonly T[])[] {
  const out: (readonly T[])[] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
