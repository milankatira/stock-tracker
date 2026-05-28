import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { FundNarrativeBatchQueue } from "./fund-narrative-batch.queue";
import {
  EOD_TICKER_RECOMPUTED_EVENT,
  type EodTickerRecomputedEvent,
} from "./eod-recomputed.event";

/**
 * Event-driven boundary for funds. The Phase 3 `EodRecomputeProcessor`
 * emits `eod.ticker.recomputed` for every successful recompute with an
 * `instrumentType` discriminator. This listener gates on FUND and
 * enqueues the fund-narrative-batch job. STOCK events are handled by
 * `EodRecomputedListener` (which is gated symmetrically).
 *
 * A queue outage on Phase 4 must NEVER block the durable score-history
 * write on Phase 3 — enqueue failures are logged, never thrown.
 */
@Injectable()
export class FundEodRecomputedListener {
  private readonly logger = new Logger(FundEodRecomputedListener.name);

  constructor(private readonly queue: FundNarrativeBatchQueue) {}

  @OnEvent(EOD_TICKER_RECOMPUTED_EVENT, { async: true })
  async onEodTickerRecomputed(
    event: EodTickerRecomputedEvent,
  ): Promise<void> {
    if (event.instrumentType !== "FUND") return;
    try {
      const jobId = await this.queue.enqueueForFund(
        event.ticker,
        event.dataVersionHash,
        "eod-listener",
      );
      this.logger.log(
        {
          schemeCode: event.ticker,
          dataVersionHash: event.dataVersionHash,
          jobId,
        },
        "fund_narrative_batch_enqueued",
      );
    } catch (err) {
      this.logger.warn(
        {
          schemeCode: event.ticker,
          dataVersionHash: event.dataVersionHash,
          message: err instanceof Error ? err.message : "unknown",
        },
        "fund_narrative_batch_enqueue_failed",
      );
    }
  }
}
