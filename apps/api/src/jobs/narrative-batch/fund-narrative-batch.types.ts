import type { NarrativeContext } from "../../ai/ai.service";
import type { Verdict } from "../../ai/fallback-narrative";

export const FUND_NARRATIVE_BATCH_QUEUE_NAME = "fund-narrative-batch";
export const FUND_NARRATIVE_BATCH_JOB_NAME = "fund-narrative";

export interface FundNarrativeBatchJobData {
  readonly schemeCode: string;
  readonly dataVersionHash: string;
  readonly triggeredBy?: string;
}

export interface FundNarrativeContextBundle {
  readonly schemeCode: string;
  readonly dataVersionHash: string;
  readonly score: number;
  readonly verdict: Verdict;
  readonly context: NarrativeContext;
}
