import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NarrativeBatchQueue } from "./narrative-batch.queue";
import {
  EOD_TICKER_RECOMPUTED_EVENT,
  type EodTickerRecomputedEvent,
} from "./eod-recomputed.event";

/**
 * Event-driven boundary between Phase 3 EOD recompute and Phase 4
 * narrative-batch. Listener wraps the `enqueueForTicker` call in a
 * try/catch so a queue outage on Phase 4 NEVER blocks the durable
 * score-history write on Phase 3.
 */
@Injectable()
export class EodRecomputedListener {
  private readonly logger = new Logger(EodRecomputedListener.name);

  constructor(private readonly queue: NarrativeBatchQueue) {}

  @OnEvent(EOD_TICKER_RECOMPUTED_EVENT, { async: true })
  async onEodTickerRecomputed(
    event: EodTickerRecomputedEvent,
  ): Promise<void> {
    // Fund events are handled by `FundEodRecomputedListener`; keep this
    // listener focused on stock instruments only.
    if (event.instrumentType !== "STOCK") return;
    try {
      const jobId = await this.queue.enqueueForTicker(
        event.ticker,
        event.dataVersionHash,
        "eod-listener",
      );
      this.logger.log(
        {
          ticker: event.ticker,
          dataVersionHash: event.dataVersionHash,
          jobId,
        },
        "narrative_batch_enqueued",
      );
    } catch (err) {
      this.logger.warn(
        {
          ticker: event.ticker,
          dataVersionHash: event.dataVersionHash,
          message: err instanceof Error ? err.message : "unknown",
        },
        "narrative_batch_enqueue_failed",
      );
    }
  }
}
