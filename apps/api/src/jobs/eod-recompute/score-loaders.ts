import { Injectable, NotImplementedException } from "@nestjs/common";
import type { ScoreFundInput, ScoreStockInput } from "../../scoring";

/**
 * Interface seam between Phase 2 (data assembly) and Phase 3 (compute
 * orchestration). The runtime implementation will pull from the
 * instrument master + price-history + fundamentals services landed in
 * Plan 02-03. Until those data assemblers are stitched together for
 * scoring, the loaders throw — but the SHAPE is frozen so the
 * EodRecomputeProcessor and tests can wire against it.
 *
 * Integration tests inject `StubStocksScoreLoader` / `StubFundsScoreLoader`
 * that return fixtures from Plans 03-01 / 03-02 to exercise the EOD
 * pipeline end-to-end without depending on real data.
 */

@Injectable()
export class StocksScoreLoader {
  async loadScoreInput(
    _instrumentId: string,
    _asOfDate: string,
  ): Promise<ScoreStockInput> {
    // NEWS-04 SEAM — sentiment pillar wire-up point.
    // When the real Phase-2↔3 data assembler lands here, the sentiment
    // pillar plugs in as a single line:
    //
    //   const { sentiment } =
    //     await this.sentiment.computePillar(_instrumentId, new Date(_asOfDate));
    //   input.sentiment = sentiment;  // ScoreStockSentiment | null
    //
    // `SentimentService.computePillar()` already returns the exact
    // `ScoreStockSentiment | null` shape this builder needs; `null`
    // preserves the Phase-3 neutral fallback (NO_SENTIMENT_DATA_PRE_PHASE_6).
    // Injection is deferred to avoid a module cycle
    // (EodRecomputeModule → SentimentModule → EodRecomputeModule); resolve
    // by relocating the loader or using forwardRef when the assembler is built.
    // The scoring engine's consumption of this field is proven in
    // `sentiment/sentiment-scoring-contract.spec.ts`.
    throw new NotImplementedException(
      "StocksScoreLoader is a Phase 2 ↔ Phase 3 interface seam — wire the real data assembler before enabling the EOD cron.",
    );
  }
}

@Injectable()
export class FundsScoreLoader {
  async loadScoreInput(
    _instrumentId: string,
    _asOfDate: string,
  ): Promise<ScoreFundInput> {
    throw new NotImplementedException(
      "FundsScoreLoader is a Phase 2 ↔ Phase 3 interface seam — wire the real data assembler before enabling the EOD cron.",
    );
  }
}
