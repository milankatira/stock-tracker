import { Injectable, NotImplementedException } from "@nestjs/common";
import type { NarrativeContextBundle } from "./narrative-batch.types";

/**
 * Phase 2 ↔ Phase 4 interface seam. The narrative-batch processor
 * asks for a bundle of `{ ticker, dataVersionHash, score, verdict,
 * NarrativeContext }`; the real implementation joins the instrument
 * master + latest persisted ScoreResult + verified-value extraction
 * once the Plan 04-03 data assembly lands.
 *
 * Throws `NotImplementedException` until that wiring is in place — the
 * processor + EOD-listener + queue idempotency all ship today and the
 * tests inject a fake provider.
 */
@Injectable()
export class NarrativeContextProvider {
  async forTicker(_ticker: string): Promise<NarrativeContextBundle> {
    throw new NotImplementedException(
      "NarrativeContextProvider is a Plan 04-02 ↔ Plan 04-03 interface seam — wire the live data assembly before enabling the narrative-batch worker.",
    );
  }
}
