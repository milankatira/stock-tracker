import { Injectable, NotImplementedException } from "@nestjs/common";
import type { FundNarrativeContextBundle } from "./fund-narrative-batch.types";

/**
 * Phase 3 ↔ Phase 4 seam for mutual funds. Mirrors
 * `NarrativeContextProvider` (stocks). The real implementation joins
 * the fund master + latest persisted fund score + verified-value
 * extraction once the MF EOD recompute leg lands in Phase 3.
 *
 * Throws `NotImplementedException` until that wiring is in place — the
 * processor + EOD-listener + queue idempotency all ship today and the
 * tests inject a fake provider.
 */
@Injectable()
export class FundNarrativeContextProvider {
  async forFund(_schemeCode: string): Promise<FundNarrativeContextBundle> {
    throw new NotImplementedException(
      "FundNarrativeContextProvider is a Plan 04-05 ↔ Phase 3 interface seam — wire the live MF EOD data assembly before enabling the fund narrative-batch worker.",
    );
  }
}
