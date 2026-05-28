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
