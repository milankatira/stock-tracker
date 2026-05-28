import type { NarrativeContext } from "../../ai/ai.service";
import type { Verdict } from "../../ai/fallback-narrative";

export const NARRATIVE_BATCH_QUEUE_NAME = "narrative-batch";
export const NARRATIVE_BATCH_JOB_NAME = "narrative";

export interface NarrativeBatchJobData {
  readonly ticker: string;
  readonly dataVersionHash: string;
  readonly triggeredBy?: string;
}

/**
 * Bundle of data the processor needs to build a `NarrativeContext` and
 * to emit a compliance-safe fallback when the audit budget is
 * exhausted. The `NarrativeContextProvider` (Plan 04-02 stub, real
 * implementation lands with the Phase 2 ↔ Phase 4 data assembly) is
 * responsible for returning this shape — including the live
 * `dataVersionHash` so the processor can guard against stale-version
 * drift.
 */
export interface NarrativeContextBundle {
  readonly ticker: string;
  readonly dataVersionHash: string;
  readonly score: number;
  readonly verdict: Verdict;
  readonly context: NarrativeContext;
}
