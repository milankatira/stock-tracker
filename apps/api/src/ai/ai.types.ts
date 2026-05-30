/** Public AI output contract exchanged across `ComplianceInterceptor`. */
export interface AiOutput {
  readonly text: string;
  readonly citedSources: readonly string[];
  /** When `true`, the interceptor attaches `PAST_PERF_DISCLAIMER`. */
  readonly touchesReturns?: boolean;
}

export interface NarrativeResult extends AiOutput {
  readonly generatedAt: string;
  readonly auditPassed: true;
}

export interface SwotResult {
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly opportunities: readonly string[];
  readonly threats: readonly string[];
  readonly citedSources: readonly string[];
}

/**
 * `AiService.swot()` output — carries the per-quadrant structure for
 * downstream callers (Plan 04-02 narrative-batch processor persists it
 * verbatim) AND the joined `text` field so the compliance interceptor
 * can audit the same bullets a human reader would see.
 */
export interface SwotOutput extends AiOutput, SwotResult {}

/** News-sentiment label (NEWS-02). Mirrors `packages/shared` and `sentiment/aggregator`. */
export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

/**
 * Result of `AiService.classifySentiment()`. `rationaleOneLine` is
 * post-sanitiser — it is set to `null` if the model emitted any
 * forbidden verb, so the persisted rationale is always compliance-clean.
 */
export interface SentimentResult {
  readonly sentiment: SentimentLabel;
  readonly confidence: number;
  readonly rationaleOneLine: string | null;
}

/** Failure mode emitted when the audit loop exhausts its retry budget. */
export class NarrativeAuditFailedError extends Error {
  constructor(public readonly attempts: number, message: string) {
    super(message);
    this.name = "NarrativeAuditFailedError";
  }
}
